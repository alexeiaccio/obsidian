import { Modal, Notice, setIcon } from "obsidian";
import type ClipperPlugin from "../main";
import { buildCollectionStates, planCollectionChanges, type CollectionState } from "../lib/collections";
import type { ATBookmarkItem, DataSource } from "../sources/types";
import { SembleSource } from "../sources/semble";
import { MarginSource } from "../sources/margin";
import { BookmarkSource } from "../sources/community";

interface TagState {
	tag: string;
	isSelected: boolean;
}

export class EditItemModal extends Modal {
	plugin: ClipperPlugin;
	item: ATBookmarkItem;
	onSuccess?: () => void;
	collectionStates: CollectionState[] = [];
	tagStates: TagState[] = [];
	newTagInput: HTMLInputElement | null = null;
	private sembleSource!: SembleSource;
	private marginSource!: MarginSource;
	private itemSource!: DataSource;

	constructor(plugin: ClipperPlugin, item: ATBookmarkItem, onSuccess?: () => void) {
		super(plugin.app);
		this.plugin = plugin;
		this.item = item;
		this.onSuccess = onSuccess;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("clipper-modal");
		contentEl.createEl("h2", { text: "Edit item" });

		if (!this.plugin.client) {
			contentEl.createEl("p", { text: "Not connected." });
			return;
		}

		const loading = contentEl.createEl("p", { text: "Loading..." });

		try {
			const did = this.plugin.settings.did!;
			this.sembleSource = new SembleSource(this.plugin.client, did);
			this.marginSource = new MarginSource(this.plugin.client, did);
			const itemSourceName = this.item.getSource();
			this.itemSource = itemSourceName === "semble" ? this.sembleSource
				: itemSourceName === "margin" ? this.marginSource
				: new BookmarkSource(this.plugin.client, did);

			const itemUri = this.item.getUri();

			const canCollect = this.item.canAddToCollections();
			const [sembleColls, sembleAssocs, marginColls, marginAssocs, availableTags] = await Promise.all([
				canCollect ? this.sembleSource.getAvailableCollections() : Promise.resolve([]),
				canCollect ? this.sembleSource.getCollectionAssociations() : Promise.resolve([]),
				canCollect ? this.marginSource.getAvailableCollections() : Promise.resolve([]),
				canCollect ? this.marginSource.getCollectionAssociations() : Promise.resolve([]),
				this.itemSource.getAvilableTags?.() ?? Promise.resolve(undefined),
			]);

			loading.remove();

			// Only the item's OWN source. Offering both let the form write a collection link to
			// the wrong service — a semble card joining a margin collection produces an
			// at.margin.collectionItem whose annotation is a cosmik URI, which margin's own
			// lexicon says is an at.margin.annotation.
			if (canCollect && (itemSourceName === "semble" || itemSourceName === "margin")) {
				this.collectionStates = buildCollectionStates({
					itemUri,
					source: itemSourceName,
					collections: itemSourceName === "semble" ? sembleColls : marginColls,
					associations: itemSourceName === "semble" ? sembleAssocs : marginAssocs,
				});
			}

			if (this.item.canAddTags() && availableTags) {
				const currentTags = new Set(this.item.getTags());
				this.tagStates = availableTags.map(f => f.value).sort().map(tag => ({
					tag,
					isSelected: currentTags.has(tag),
				}));
			}

			this.renderForm(contentEl);
		} catch (err) {
			loading.remove();
			const message = err instanceof Error ? err.message : String(err);
			contentEl.createEl("p", { text: `Error: ${message}`, cls: "clipper-error" });
		}
	}

	private renderForm(contentEl: HTMLElement) {
		const form = contentEl.createEl("div", { cls: "clipper-form" });

		if (this.item.canAddTags()) {
			const tagsGroup = form.createEl("div", { cls: "clipper-form-group" });
			tagsGroup.createEl("label", { text: "Tags" });

			const tagsList = tagsGroup.createEl("div", { cls: "clipper-tag-list" });
			for (const state of this.tagStates) {
				this.addTagChip(tagsList, state);
			}

			const newTagRow = tagsGroup.createEl("div", { cls: "clipper-tag-row" });
			this.newTagInput = newTagRow.createEl("input", {
				type: "text",
				cls: "clipper-input",
				attr: { placeholder: "Add new tag..." },
			});
			const addBtn = newTagRow.createEl("button", {
				text: "Add",
				cls: "clipper-btn clipper-btn-secondary",
				attr: { type: "button" },
			});
			addBtn.addEventListener("click", () => {
				const value = this.newTagInput?.value.trim();
				if (value && !this.tagStates.some(s => s.tag === value)) {
					const newState = { tag: value, isSelected: true };
					this.tagStates.push(newState);
					this.addTagChip(tagsList, newState);
					if (this.newTagInput) this.newTagInput.value = "";
				}
			});
		}

		if (this.collectionStates.length > 0) {
			const collectionsGroup = form.createEl("div", { cls: "clipper-form-group" });
			collectionsGroup.createEl("label", { text: "Collections" });

			const searchInput = collectionsGroup.createEl("input", {
				type: "text",
				cls: "clipper-input clipper-collection-search",
				attr: { placeholder: "Search collections..." },
			});

			const collectionsList = collectionsGroup.createEl("div", { cls: "clipper-collection-list" });

			const rows: { el: HTMLElement; name: string }[] = [];
			for (const state of this.collectionStates) {
				const item = collectionsList.createEl("label", { cls: "clipper-collection-item" });

				const checkbox = item.createEl("input", { type: "checkbox", cls: "clipper-collection-checkbox" });
				checkbox.checked = state.isSelected;
				checkbox.addEventListener("change", () => { state.isSelected = checkbox.checked; });

				const info = item.createEl("div", { cls: "clipper-collection-item-info" });
				info.createEl("span", { text: state.name, cls: "clipper-collection-item-name" });
				if (state.description) {
					info.createEl("span", { text: state.description, cls: "clipper-collection-item-desc" });
				}

				const sourceIcon = item.createEl("span", { cls: "clipper-collection-source-icon" });
				setIcon(sourceIcon, state.source === "semble" ? "clipper-semble" : "clipper-margin");

				rows.push({ el: item, name: state.name.toLowerCase() });
			}

			searchInput.addEventListener("input", () => {
				const query = searchInput.value.toLowerCase();
				for (const row of rows) {
					row.el.style.display = row.name.includes(query) ? "" : "none";
				}
			});
		}

		const actions = contentEl.createEl("div", { cls: "clipper-modal-actions" });

		actions.createEl("button", { text: "Delete", cls: "clipper-btn clipper-btn-danger" })
			.addEventListener("click", () => { this.confirmDelete(contentEl); });

		actions.createEl("div", { cls: "clipper-spacer" });

		actions.createEl("button", { text: "Cancel", cls: "clipper-btn clipper-btn-secondary" })
			.addEventListener("click", () => { this.close(); });

		actions.createEl("button", { text: "Save", cls: "clipper-btn clipper-btn-primary" })
			.addEventListener("click", () => { void this.saveChanges(); });
	}

	private addTagChip(container: HTMLElement, state: TagState) {
		const item = container.createEl("label", { cls: "clipper-tag-item" });
		const checkbox = item.createEl("input", { type: "checkbox" });
		checkbox.checked = state.isSelected;
		checkbox.addEventListener("change", () => { state.isSelected = checkbox.checked; });
		item.createEl("span", { text: state.tag });
	}

	private confirmDelete(contentEl: HTMLElement) {
		contentEl.empty();
		contentEl.createEl("h2", { text: "Delete item" });
		contentEl.createEl("p", { text: "Are you sure you want to delete this item?", cls: "clipper-warning-text" });

		const actions = contentEl.createEl("div", { cls: "clipper-modal-actions" });
		actions.createEl("button", { text: "Cancel", cls: "clipper-btn clipper-btn-secondary" })
			.addEventListener("click", () => { void this.onOpen(); });
		actions.createEl("button", { text: "Delete", cls: "clipper-btn clipper-btn-danger" })
			.addEventListener("click", () => { void this.handleDelete(); });
	}

	private async handleDelete() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("p", { text: "Deleting..." });

		try {
			await this.itemSource.deleteItem!(this.item.getUri());
			new Notice("Deleted");
			this.close();
			this.onSuccess?.();
		} catch (err) {
			contentEl.empty();
			const message = err instanceof Error ? err.message : String(err);
			contentEl.createEl("p", { text: `Failed to delete: ${message}`, cls: "clipper-error" });
		}
	}

	private async saveChanges() {
		if (!this.plugin.client) return;

		// Read pending tag input before clearing DOM
		const pendingNewTag = this.newTagInput?.value.trim();

		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("p", { text: "Saving..." });

		try {
			const messages: string[] = [];

			if (this.item.canAddTags() && this.itemSource.updateTags) {
				const selectedTags = this.tagStates.filter(s => s.isSelected).map(s => s.tag);
				if (pendingNewTag && !selectedTags.includes(pendingNewTag)) {
					selectedTags.push(pendingNewTag);
				}
				await this.itemSource.updateTags(this.item.getUri(), [...new Set(selectedTags)]);
				messages.push("Tags updated");
			}

			const { toAdd, toRemove } = planCollectionChanges(this.collectionStates);

			for (const state of toRemove) {
				if (state.linkUri) {
					const source = state.source === "semble" ? this.sembleSource : this.marginSource;
					await source.removeFromCollection(state.linkUri);
				}
			}

			for (const state of toAdd) {
				const source = state.source === "semble" ? this.sembleSource : this.marginSource;
				await source.addToCollection(this.item.getUri(), this.item.getCid(), state.uri);
			}

			if (toAdd.length > 0) messages.push(`Added to ${toAdd.length} collection${toAdd.length > 1 ? "s" : ""}`);
			if (toRemove.length > 0) messages.push(`Removed from ${toRemove.length} collection${toRemove.length > 1 ? "s" : ""}`);

			new Notice(messages.length > 0 ? messages.join(". ") : "Saved");
			this.close();
			this.onSuccess?.();
		} catch (err) {
			contentEl.empty();
			const message = err instanceof Error ? err.message : String(err);
			contentEl.createEl("p", { text: `Failed to save: ${message}`, cls: "clipper-error" });
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}
