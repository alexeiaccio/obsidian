import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import GitHubStarsExporterPlugin from "../main";
import type { GitHubStarsExporterSettings } from "../settings";

export class GitHubStarsExporterSettingTab extends PluginSettingTab {
	plugin: GitHubStarsExporterPlugin;

	constructor(app: App, plugin: GitHubStarsExporterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "GitHub Stars Exporter Settings" });

		// GitHub Token
		new Setting(containerEl)
			.setName("GitHub Personal Access Token")
			.setDesc(
				"A GitHub personal access token with 'public_repo' scope. Leave empty for anonymous access (limited to 60 requests/hour).",
			)
			.addText((text) =>
				text
					.setPlaceholder("ghp_xxxxxxxxxxxx")
					.setValue(this.plugin.settings.githubToken)
					.onChange(async (value) => {
						this.plugin.settings.githubToken = value;
						await this.plugin.saveSettings();
					}),
			)
			.addButton((button) =>
				button
					.setButtonText("Validate Token")
					.onClick(async () => {
						if (!this.plugin.settings.githubToken.trim()) {
							new Notice("Please enter a token first");
							return;
						}

						button.setDisabled(true);
						button.setButtonText("Validating...");

						const isValid = await this.plugin.validateGitHubToken();
						button.setDisabled(false);
						button.setButtonText("Validate Token");

						if (isValid) {
							new Notice("Token is valid!");
						} else {
							new Notice("Token validation failed. Please check the token and permissions.");
						}
					}),
			);

		// Default Output Folder
		new Setting(containerEl)
			.setName("Default Output Folder")
			.setDesc(
				"Path to the folder where exported notes will be saved (relative to vault root). Leave empty to choose each time.",
			)
			.addText((text) =>
				text
					.setPlaceholder("e.g., GitHub Stars")
					.setValue(this.plugin.settings.defaultOutputFolder)
					.onChange(async (value) => {
						this.plugin.settings.defaultOutputFolder = value;
						await this.plugin.saveSettings();
					}),
			);

		// Auto Sync Settings
		containerEl.createEl("h3", { text: "Automatic Synchronization" });

		new Setting(containerEl)
			.setName("Enable Auto Sync")
			.setDesc("Automatically fetch new stars at regular intervals")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoSyncEnabled)
					.onChange(async (value) => {
						this.plugin.settings.autoSyncEnabled = value;
						await this.plugin.saveSettings();
						await this.plugin.restartAutoSync();
					}),
			);

		new Setting(containerEl)
			.setName("Sync Interval")
			.setDesc("How often to check for new stars")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("daily", "Daily")
					.addOption("weekly", "Weekly")
					.addOption("monthly", "Monthly")
					.setValue(this.plugin.settings.syncInterval)
					.onChange(async (value: "daily" | "weekly" | "monthly") => {
						this.plugin.settings.syncInterval = value;
						await this.plugin.saveSettings();
						await this.plugin.restartAutoSync();
					}),
			);

		// Display Last Sync
		if (this.plugin.settings.lastSyncTimestamp > 0) {
			const lastSync = new Date(this.plugin.settings.lastSyncTimestamp).toLocaleString();
			new Setting(containerEl)
				.setName("Last Sync")
				.setDesc(`Last synchronized on ${lastSync}`)
				.setDisabled(true);
		}

		// Export Settings
		containerEl.createEl("h3", { text: "Export Options" });

		new Setting(containerEl)
			.setName("Maximum Stars to Fetch")
			.setDesc("Limit the number of stars to fetch (0 for unlimited)")
			.addText((text) =>
				text
					.setPlaceholder("1000")
					.setValue(this.plugin.settings.maxStarsToFetch.toString())
					.onChange(async (value) => {
						const num = parseInt(value);
						if (!isNaN(num) && num >= 0) {
							this.plugin.settings.maxStarsToFetch = num;
							await this.plugin.saveSettings();
						}
					}),
			);

		new Setting(containerEl)
			.setName("Include README Content")
			.setDesc("Include repository README content in exported notes")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeReadme)
					.onChange(async (value) => {
						this.plugin.settings.includeReadme = value;
						await this.plugin.saveSettings();
					}),
			);

		// Template
		new Setting(containerEl)
			.setName("Export Template")
			.setDesc(
				"Template for the exported notes. Available variables: {name}, {full_name}, {owner}, {description}, {language}, {stars}, {forks}, {html_url}, {homepage}, {topics}, {created_at}, {updated_at}, {pushed_at}, {starred_at}, {readme}",
			)
			.addTextArea((text) =>
				text
					.setValue(this.plugin.settings.template)
					.onChange(async (value) => {
						this.plugin.settings.template = value;
						await this.plugin.saveSettings();
					}),
			);

		// Reset Template button
		new Setting(containerEl)
			.addButton((button) =>
				button
					.setButtonText("Reset to Default Template")
					.onClick(async () => {
						// Import default template
						const { DEFAULT_SETTINGS } = await import("../settings");
						this.plugin.settings.template = DEFAULT_SETTINGS.template;
						await this.plugin.saveSettings();
						this.display(); // Refresh settings display
						new Notice("Template reset to default");
					}),
			);
	}
}