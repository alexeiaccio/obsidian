import { Notice, Plugin } from "obsidian";
import { formatRepositoryMarkdown } from "./formatters/markdown";
import { GitHubApiError, GitHubClient } from "./github/api";
import type { StarredRepository } from "./github/types";
import { AutoSyncScheduler } from "./scheduler/auto-sync";
import { DEFAULT_SETTINGS, type GitHubStarsExporterSettings } from "./settings";
import { FolderSelectorModal } from "./ui/folder-modal";
import { ProgressModal } from "./ui/progress-modal";
import { GitHubStarsExporterSettingTab } from "./ui/settings-tab";
import {
	createOrUpdateIndexFile,
	createOrUpdateRepositoryFile,
	getOutputFolder,
} from "./utils/file-helper";

export default class GitHubStarsExporterPlugin extends Plugin {
	settings: GitHubStarsExporterSettings;
	autoSyncScheduler: AutoSyncScheduler;

	async onload() {
		await this.loadSettings();

		// Initialize auto-sync scheduler
		this.autoSyncScheduler = new AutoSyncScheduler(this);

		// Add main export command
		this.addCommand({
			id: "export-github-stars",
			name: "Export GitHub Stars to Notes",
			callback: async () => {
				await this.exportAllStars(false);
			},
		});

		// Add export to specific folder command
		this.addCommand({
			id: "export-github-stars-to-folder",
			name: "Export GitHub Stars to Specific Folder",
			callback: async () => {
				await this.selectFolderAndExport();
			},
		});

		// Add sync now command
		this.addCommand({
			id: "sync-github-stars-now",
			name: "Sync GitHub Stars Now",
			callback: async () => {
				await this.exportAllStars(false);
			},
		});

		// Add settings tab
		this.addSettingTab(new GitHubStarsExporterSettingTab(this.app, this));

		// Start auto-sync if enabled
		if (this.settings.autoSyncEnabled) {
			this.autoSyncScheduler.start();
		}
	}

	onunload() {
		// Stop auto-sync
		if (this.autoSyncScheduler) {
			this.autoSyncScheduler.stop();
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async validateGitHubToken(): Promise<boolean> {
		try {
			if (!this.settings.githubToken.trim()) {
				return false;
			}

			const client = new GitHubClient(this.settings.githubToken);
			return await client.validateToken();
		} catch (error) {
			console.error("Token validation error:", error);
			return false;
		}
	}

	async restartAutoSync(): Promise<void> {
		if (this.autoSyncScheduler) {
			this.autoSyncScheduler.restart();
		}
	}

	private async selectFolderAndExport(): Promise<void> {
		const modal = new FolderSelectorModal(this.app, async (folder) => {
			await this.exportStarsToFolder(folder.path);
		});
		modal.open();
	}

	async exportAllStars(silent: boolean = false): Promise<void> {
		try {
			if (!this.settings.githubToken.trim()) {
				if (!silent) {
					new Notice("Please configure a GitHub token in settings first.");
				}
				return;
			}

			const folderPath = this.settings.defaultOutputFolder.trim();
			if (!folderPath) {
				if (!silent) {
					new Notice(
						"Please configure a default output folder in settings first.",
					);
				}
				return;
			}

			await this.exportStarsToFolder(folderPath, silent);
		} catch (error) {
			console.error("Export failed:", error);
			if (!silent) {
				new Notice(`Export failed: ${error.message}`);
			}
		}
	}

	private async exportStarsToFolder(
		folderPath: string,
		silent: boolean = false,
	): Promise<void> {
		const progressModal = new ProgressModal(this.app, {
			title: "Exporting GitHub Stars",
			total: 0,
			cancellable: true,
			onCancel: () => {
				// Handle cancellation if needed
			},
		});

		if (!silent) {
			progressModal.open();
		}

		try {
			const client = new GitHubClient(this.settings.githubToken);
			const maxStars =
				this.settings.maxStarsToFetch > 0
					? this.settings.maxStarsToFetch
					: undefined;

			let repositories: StarredRepository[] = [];
			let totalCount = 0;

			// First, try to get total count (this might fail with anonymous access)
			try {
				const initialFetch = await client.getStarredRepositories(
					1,
					(fetched, total) => {
						totalCount = total;
						if (!silent && progressModal && !progressModal.isCancelled()) {
							progressModal.updateProgress(
								0,
								`Found ${total} stars to fetch...`,
							);
						}
					},
				);
			} catch (error) {
				// If we can't get count, just proceed without it
				console.warn("Could not determine total count:", error);
			}

			// Fetch all repositories
			repositories = await client.getStarredRepositories(
				maxStars,
				(fetched, total) => {
					if (!silent && progressModal && !progressModal.isCancelled()) {
						progressModal.updateProgress(
							fetched,
							`Fetching stars: ${fetched} of ${total || maxStars || "?"}`,
						);
					}
				},
			);

			if (progressModal.isCancelled()) {
				return;
			}

			if (!silent) {
				progressModal.updateProgress(
					0,
					`Processing ${repositories.length} repositories...`,
				);
			}

			// Get the output folder
			const folder = await getOutputFolder(this.app, {
				defaultOutputFolder: folderPath,
			});

			let successCount = 0;
			let errorCount = 0;

			// Process each repository
			for (let i = 0; i < repositories.length; i++) {
				if (progressModal.isCancelled()) {
					break;
				}

				const repo = repositories[i];

				if (!silent) {
					progressModal.updateProgress(i, `Processing ${repo.full_name}...`);
				}

				try {
					// Fetch README if enabled
					if (this.settings.includeReadme) {
						try {
							repo.readme_content =
								(await client.getReadmeContent(repo.owner.login, repo.name)) ||
								undefined;
						} catch (readmeError) {
							console.warn(
								`Failed to fetch README for ${repo.full_name}:`,
								readmeError,
							);
							// Continue without README
						}
					}

					// Format and create markdown file
					const content = formatRepositoryMarkdown(
						repo,
						this.settings.template,
						this.settings.includeReadme,
					);
					const file = await createOrUpdateRepositoryFile(
						this.app,
						folder,
						repo,
						content,
					);

					if (file) {
						successCount++;
					} else {
						errorCount++;
					}
				} catch (repoError) {
					console.error(`Failed to process ${repo.full_name}:`, repoError);
					errorCount++;
				}
			}

			// Create/update index file
			if (!progressModal.isCancelled()) {
				try {
					await createOrUpdateIndexFile(this.app, folder, repositories);
				} catch (indexError) {
					console.error("Failed to create index file:", indexError);
				}
			}

			// Update last sync timestamp
			this.settings.lastSyncTimestamp = Date.now();
			await this.saveSettings();

			// Show completion message
			if (!silent) {
				progressModal.close();

				let message = `Exported ${successCount} repositories to "${folderPath}"`;
				if (errorCount > 0) {
					message += ` (${errorCount} errors)`;
				}

				new Notice(message);
			}
		} catch (error) {
			console.error("Export failed:", error);

			if (!silent) {
				progressModal.close();

				if (error instanceof GitHubApiError) {
					if (error.status === 401) {
						new Notice(
							"Authentication failed. Please check your GitHub token.",
						);
					} else if (error.status === 403) {
						new Notice("Rate limit exceeded. Please wait and try again.");
					} else {
						new Notice(`GitHub API error: ${error.message}`);
					}
				} else {
					new Notice(`Export failed: ${error.message}`);
				}
			}

			throw error;
		}
	}
}
