import {
	type App,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	type TFolder,
} from "obsidian";
import { getPinnedItems } from "./arc/fetcher";
import { formatSpaceNote } from "./scraper";
import { type ArcExporterSettings, DEFAULT_SETTINGS } from "./settings";
import { SpaceSelectorModal } from "./ui/space-selector";
import { createExportFile, getOutputFolder } from "./utils/file-helper";

export default class ArcExporterPlugin extends Plugin {
	settings: ArcExporterSettings;

	async onload() {
		await this.loadSettings();

		// Add the main command
		this.addCommand({
			id: "export-arc-spaces",
			name: "Export Arc Spaces to Notes",
			callback: async () => {
				const modal = new SpaceSelectorModal(
					this.app,
					async (selectedSpaces: string[]) => {
						let outputFolder: TFolder | null = null;
						try {
							outputFolder = await getOutputFolder(this.app, this.settings);
							if (!outputFolder) {
								new Notice("Unable to determine output folder.");
								return;
							}
						} catch (error) {
							new Notice(`Error setting up folder: ${error.message}`);
							return;
						}

						let successCount = 0;
						const errors: string[] = [];

						for (const spaceName of selectedSpaces) {
							try {
								const pinnedItems = await getPinnedItems(
									[spaceName],
									this.settings.jsonPath,
								);
								if (pinnedItems.length === 0) {
									errors.push(`${spaceName}: No pinned items`);
									continue;
								}
								const scraped = { name: spaceName, pinnedItems };
								const content = formatSpaceNote(scraped);
								const filename = `Arc - ${spaceName}`;
								const file = await createExportFile(
									this.app,
									outputFolder,
									filename,
									content,
								);
								if (file) {
									successCount++;
								} else {
									errors.push(`${spaceName}: Failed to create file`);
								}
							} catch (error) {
								console.error(`Export failed for ${spaceName}:`, error);
								errors.push(`${spaceName}: ${error.message}`);
							}
						}

						let message = `${successCount} spaces exported to "${outputFolder.path || "root"}"`;
						if (errors.length > 0) {
							message += `\nErrors: ${errors.join(", ")}`;
						}
						new Notice(message);
					},
					this.settings.jsonPath,
				);
				modal.open();
			},
		});

		// Add settings tab
		this.addSettingTab(new ArcSettingTab(this.app, this));
	}

	onunload() {
		// Cleanup if needed
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class ArcSettingTab extends PluginSettingTab {
	plugin: ArcExporterPlugin;

	constructor(app: App, plugin: ArcExporterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Arc Spaces Exporter Settings" });

		new Setting(containerEl)
			.setName("Default Output Folder")
			.setDesc(
				"Path to the folder where exported notes will be saved (relative to vault root). Leave empty to choose each time.",
			)
			.addText((text) =>
				text
					.setPlaceholder("e.g., Arc Exports")
					.setValue(this.plugin.settings.defaultOutputFolder)
					.onChange(async (value) => {
						this.plugin.settings.defaultOutputFolder = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Arc JSON Path")
			.setDesc(
				"Path to Arc's StorableSidebar.json file. Defaults to standard location.",
			)
			.addText((text) =>
				text
					.setPlaceholder(
						"/Users/username/Library/Application Support/Arc/StorableSidebar.json",
					)
					.setValue(this.plugin.settings.jsonPath)
					.onChange(async (value) => {
						this.plugin.settings.jsonPath = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
