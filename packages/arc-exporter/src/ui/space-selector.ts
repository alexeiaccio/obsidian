import { type App, Modal, Notice, Setting } from "obsidian";
import { getSpaces } from "../arc/fetcher";

type SpaceSelectorCallback = (selectedSpaces: string[]) => void;

export class SpaceSelectorModal extends Modal {
	callback: SpaceSelectorCallback;
	jsonPath: string;
	spaces: string[] = [];
	selectedSpaces: Set<string> = new Set();

	constructor(app: App, callback: SpaceSelectorCallback, jsonPath: string) {
		super(app);
		this.callback = callback;
		this.jsonPath = jsonPath;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Select Arc Spaces to Export" });
		contentEl.createEl("p", {
			text: "Check the spaces you want to scrape pinned items from.",
		});

		try {
			this.spaces = (await getSpaces(this.jsonPath)).map((s) => s.title);
			if (this.spaces.length === 0) {
				contentEl.createEl("p", {
					text: "No spaces found in Arc",
					cls: "error",
				});
				return;
			}

			this.spaces.forEach((spaceName) => {
				new Setting(contentEl).setName(spaceName).addToggle((toggle) =>
					toggle.setValue(false).onChange((value) => {
						if (value) {
							this.selectedSpaces.add(spaceName);
						} else {
							this.selectedSpaces.delete(spaceName);
						}
					}),
				);
			});

			// Confirm button
			new Setting(contentEl).addButton((button) =>
				button
					.setButtonText("Export Selected")
					.setCta()
					.onClick(() => {
						if (this.selectedSpaces.size === 0) {
							new Notice("Please select at least one space.");
							return;
						}
						this.close();
						this.callback(Array.from(this.selectedSpaces));
					}),
			);
		} catch (error) {
			contentEl.createEl("p", {
				text: `Error loading spaces: ${error.message}`,
				cls: "error",
			});
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
