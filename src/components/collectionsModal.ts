import { Modal, Notice, Setting } from "obsidian";
import type ClipperPlugin from "../main";
import {
	buildCollectionStates,
	planCollectionChanges,
	type CollectionState,
} from "../lib/collections";
import { MarginSource } from "../sources/margin";
import { SembleSource } from "../sources/semble";
import type { ATBookmarkItem, DataSource } from "../sources/types";

/** A source that can put an item into collections. */
const collectableSource = (plugin: ClipperPlugin, name: string): DataSource | undefined => {
	const did = plugin.settings.did;
	if (!did) {
		return undefined;
	}
	if (name === "semble") {
		return new SembleSource(plugin.client, did);
	}
	if (name === "margin") {
		return new MarginSource(plugin.client, did);
	}
	return undefined;
};

/**
 * Tick the collections an item belongs to.
 *
 * The same lists the Edit modal shows, on their own — only the toggles that changed
 * are written back, so opening the picker and closing it touches nothing.
 */
export class CollectionsModal extends Modal {
	private states: CollectionState[] = [];
	private source?: DataSource;

	constructor(
		private readonly plugin: ClipperPlugin,
		private readonly item: ATBookmarkItem,
		private readonly onSuccess?: () => void,
	) {
		super(plugin.app);
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("clipper-modal");
		contentEl.createEl("h2", { text: "Collections" });

		const source = collectableSource(this.plugin, this.item.getSource());
		if (!source?.getAvailableCollections || !source.addToCollection) {
			contentEl.createEl("p", { text: `The ${this.item.getSource()} source has no collections.` });
			return;
		}

		const loading = contentEl.createEl("p", { text: "Loading…" });
		try {
			const [collections, associations] = await Promise.all([
				source.getAvailableCollections(),
				source.getCollectionAssociations?.() ?? Promise.resolve([]),
			]);
			loading.remove();
			this.source = source;
			this.states = buildCollectionStates({
				itemUri: this.item.getUri(),
				source: this.item.getSource() === "margin" ? "margin" : "semble",
				collections,
				associations,
			});
			this.renderForm();
		} catch (error) {
			loading.remove();
			contentEl.createEl("p", {
				text: `Failed to load collections: ${error instanceof Error ? error.message : String(error)}`,
				cls: "clipper-error",
			});
		}
	}

	private renderForm() {
		const { contentEl } = this;

		if (this.states.length === 0) {
			contentEl.createEl("p", {
				text: "No collections yet — create one from the bookmarks toolbar.",
			});
			return;
		}

		for (const state of this.states) {
			new Setting(contentEl)
				.setName(state.name)
				.setDesc(state.description ?? "")
				.addToggle((toggle) =>
					toggle.setValue(state.isSelected).onChange((value) => {
						state.isSelected = value;
					}),
				);
		}

		new Setting(contentEl).addButton((button) =>
			button.setButtonText("Apply").setCta().onClick(() => void this.apply()),
		);
	}

	private async apply() {
		const source = this.source;
		if (!source) {
			return;
		}

		const { toAdd, toRemove } = planCollectionChanges(this.states);
		if (toAdd.length === 0 && toRemove.length === 0) {
			new Notice("No collection changes");
			this.close();
			return;
		}

		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("p", { text: "Saving…" });

		try {
			for (const state of toRemove) {
				if (state.linkUri) {
					await source.removeFromCollection?.(state.linkUri);
				}
			}
			for (const state of toAdd) {
				await source.addToCollection?.(this.item.getUri(), this.item.getCid(), state.uri);
			}

			const parts: string[] = [];
			if (toAdd.length > 0) {
				parts.push(`added to ${toAdd.length} collection${toAdd.length > 1 ? "s" : ""}`);
			}
			if (toRemove.length > 0) {
				parts.push(`removed from ${toRemove.length} collection${toRemove.length > 1 ? "s" : ""}`);
			}
			new Notice(parts.join(". "));
			this.close();
			this.onSuccess?.();
		} catch (error) {
			contentEl.empty();
			contentEl.createEl("p", {
				text: `Failed to save: ${error instanceof Error ? error.message : String(error)}`,
				cls: "clipper-error",
			});
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
