import { Notice } from "obsidian";
import type { GitHubStarsExporterSettings } from "../settings";
import GitHubStarsExporterPlugin from "../main";

export class AutoSyncScheduler {
	private plugin: GitHubStarsExporterPlugin;
	private intervalId: NodeJS.Timeout | null = null;

	constructor(plugin: GitHubStarsExporterPlugin) {
		this.plugin = plugin;
	}

	start(): void {
		this.stop(); // Clear any existing interval

		if (!this.plugin.settings.autoSyncEnabled) {
			return;
		}

		const intervalMs = this.getIntervalInMilliseconds();
		const now = Date.now();
		const lastSync = this.plugin.settings.lastSyncTimestamp;
		const timeSinceLastSync = now - lastSync;

		// Calculate how long to wait until next sync
		let waitTime = intervalMs - (timeSinceLastSync % intervalMs);
		if (waitTime <= 0) {
			waitTime = intervalMs; // If we're overdue, wait for the next interval
		}

		console.log(`Auto-sync: Next sync in ${Math.round(waitTime / 1000 / 60)} minutes`);

		// Schedule first sync
		setTimeout(() => {
			this.performAutoSync();
			// Then set up recurring interval
			this.intervalId = setInterval(() => {
				this.performAutoSync();
			}, intervalMs);
		}, waitTime);
	}

	stop(): void {
		if (this.intervalId) {
			clearInterval(this.intervalId);
			this.intervalId = null;
		}
	}

	restart(): void {
		this.stop();
		this.start();
	}

	private getIntervalInMilliseconds(): number {
		const { syncInterval } = this.plugin.settings;
		switch (syncInterval) {
			case "daily":
				return 24 * 60 * 60 * 1000; // 24 hours
			case "weekly":
				return 7 * 24 * 60 * 60 * 1000; // 7 days
			case "monthly":
				return 30 * 24 * 60 * 60 * 1000; // 30 days (approximate)
			default:
				return 7 * 24 * 60 * 60 * 1000; // Default to weekly
		}
	}

	private async performAutoSync(): Promise<void> {
		try {
			console.log("Auto-sync: Starting scheduled sync");

			// Only sync if we have a GitHub token
			if (!this.plugin.settings.githubToken.trim()) {
				console.warn("Auto-sync: No GitHub token configured, skipping sync");
				return;
			}

			// Only sync if default output folder is configured
			if (!this.plugin.settings.defaultOutputFolder.trim()) {
				console.warn("Auto-sync: No default output folder configured, skipping sync");
				return;
			}

			await this.plugin.exportAllStars(true); // true = silent mode

			// Update last sync timestamp
			this.plugin.settings.lastSyncTimestamp = Date.now();
			await this.plugin.saveSettings();

			console.log("Auto-sync: Completed successfully");
			new Notice("GitHub stars auto-sync completed");

		} catch (error) {
			console.error("Auto-sync failed:", error);
			new Notice(`Auto-sync failed: ${error.message}`);
		}
	}

	getNextSyncTime(): Date | null {
		if (!this.plugin.settings.autoSyncEnabled || !this.intervalId) {
			return null;
		}

		const intervalMs = this.getIntervalInMilliseconds();
		const now = Date.now();
		const lastSync = this.plugin.settings.lastSyncTimestamp;
		const timeSinceLastSync = now - lastSync;
		const waitTime = intervalMs - (timeSinceLastSync % intervalMs);

		return new Date(now + waitTime);
	}

	isActive(): boolean {
		return this.intervalId !== null;
	}
}