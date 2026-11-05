import { Modal, Notice, setIcon } from "obsidian";
import type ClipperPlugin from "../main";
import { createSembleNote, deleteRecord } from "../lib";
import type { ATBookmarkItem } from "../sources/types";
import { openReader } from "../views/reader";
import { EditItemModal } from "./editItemModal";

export class CardDetailModal extends Modal {
	plugin: ClipperPlugin;
	item: ATBookmarkItem;
	onSuccess?: () => void;
	noteInput: HTMLTextAreaElement | null = null;

	constructor(plugin: ClipperPlugin, item: ATBookmarkItem, onSuccess?: () => void) {
		super(plugin.app);
		this.plugin = plugin;
		this.item = item;
		this.onSuccess = onSuccess;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("clipper-detail-modal");

		void this.renderBody(contentEl);

		const collections = this.item.getCollections();
		if (collections.length > 0) {
			this.renderCollectionsSection(contentEl, collections);
		}

		if (this.item.canAddTags()) {
			this.renderTagsSection(contentEl);
		}

		if (this.item.canAddNotes() && this.item.getAttachedNotes) {
			this.renderNotesSection(contentEl);
		}

		if (this.item.canAddNotes()) {
			this.renderAddNoteForm(contentEl);
		}

		const footer = contentEl.createEl("div", { cls: "clipper-detail-footer" });
		const footerLeft = footer.createEl("div", { cls: "clipper-detail-footer-left" });
		const source = this.item.getSource();
		const sourceBadge = footerLeft.createEl("span", { cls: `clipper-badge clipper-badge-${source}` });
		setIcon(sourceBadge, sourceIconId(source));
		footerLeft.createEl("span", {
			text: `Created ${new Date(this.item.getCreatedAt()).toLocaleDateString()}`,
			cls: "clipper-detail-date",
		});

		if (this.item.canEdit()) {
			const editBtn = footer.createEl("button", { cls: "clipper-detail-edit-btn" });
			setIcon(editBtn, "pencil");
			editBtn.addEventListener("click", () => {
				this.close();
				new EditItemModal(this.plugin, this.item, this.onSuccess).open();
			});
		}

		// Only a link with a real URL can be read; Arc/GitHub/Tangled/semble all expose one.
		const url = this.item.getUrl();
		if (url) {
			const readBtn = footer.createEl("button", { cls: "clipper-detail-read-btn" });
			setIcon(readBtn, "newspaper");
			readBtn.setAttribute("aria-label", "Read source");
			readBtn.addEventListener("click", () => {
				this.close();
				void openReader(this.plugin, url);
			});
		}

		const clipBtn = footer.createEl("button", { cls: "clipper-detail-clip-btn" });
		setIcon(clipBtn, "book-open");
		clipBtn.setAttribute("aria-label", "Clip to note");
		clipBtn.addEventListener("click", () => {
			void this.plugin.clipper.clipItem(this.item).catch((error) => {
				const message = error instanceof Error ? error.message : String(error);
				new Notice(`Failed to clip: ${message}`);
				console.error("Failed to clip item:", error);
			});
		});
	}

	private async renderBody(contentEl: HTMLElement) {
		const body = contentEl.createEl("div", { cls: "clipper-detail-body" });

		const title = this.item.getTitle();
		if (title) {
			body.createEl("h2", { text: title, cls: "clipper-detail-title" });
		}

		const imageUrl = await this.item.getImageUrl();
		if (imageUrl) {
			const img = body.createEl("img", { cls: "clipper-detail-image" });
			img.src = imageUrl;
			img.alt = title || "Image";
		}

		const description = this.item.getDescription();
		if (description) {
			body.createEl("p", { text: description, cls: "clipper-detail-description" });
		}

		const siteName = this.item.getSiteName();
		if (siteName) {
			const metaGrid = body.createEl("div", { cls: "clipper-detail-meta" });
			const metaItem = metaGrid.createEl("div", { cls: "clipper-detail-meta-item" });
			metaItem.createEl("span", { text: "Site", cls: "clipper-detail-meta-label" });
			metaItem.createEl("span", { text: siteName, cls: "clipper-detail-meta-value" });
		}

		const url = this.item.getUrl();
		if (url) {
			const linkWrapper = body.createEl("div", { cls: "clipper-detail-link-wrapper" });
			const link = linkWrapper.createEl("a", {
				text: url,
				href: url,
				cls: "clipper-detail-link",
			});
			link.setAttr("target", "_blank");
		}
	}

	private renderTagsSection(contentEl: HTMLElement) {
		const tags = this.item.getTags();
		if (tags.length === 0) return;
		const section = contentEl.createEl("div", { cls: "clipper-detail-tags" });
		section.createEl("h3", { text: "Tags", cls: "clipper-detail-section-title" });
		const container = section.createEl("div", { cls: "clipper-item-tags" });
		for (const tag of tags) {
			container.createEl("span", { text: tag, cls: "clipper-tag" });
		}
	}

	private renderCollectionsSection(contentEl: HTMLElement, collections: Array<{ uri: string; name: string; source: string }>) {
		const section = contentEl.createEl("div", { cls: "clipper-detail-collections" });
		section.createEl("span", { text: "In collections", cls: "clipper-detail-collections-label" });
		const badges = section.createEl("div", { cls: "clipper-detail-collections-badges" });
		for (const collection of collections) {
			const badge = badges.createEl("span", { cls: "clipper-collection" });
			const iconEl = badge.createEl("span", { cls: "clipper-collection-source-icon" });
			setIcon(iconEl, sourceIconId(collection.source as "semble" | "bookmark" | "margin"));
			badge.createEl("span", { text: collection.name });
		}
	}

	private renderNotesSection(contentEl: HTMLElement) {
		const notes = this.item.getAttachedNotes?.();
		if (!notes || notes.length === 0) return;

		const notesSection = contentEl.createEl("div", { cls: "clipper-semble-detail-notes-section" });
		notesSection.createEl("h3", { text: "Notes", cls: "clipper-detail-section-title" });

		for (const note of notes) {
			const noteEl = notesSection.createEl("div", { cls: "clipper-semble-detail-note" });

			const noteContent = noteEl.createEl("div", { cls: "clipper-semble-detail-note-content" });
			const noteIcon = noteContent.createEl("span", { cls: "clipper-semble-detail-note-icon" });
			setIcon(noteIcon, "message-square");
			noteContent.createEl("p", { text: note.text, cls: "clipper-semble-detail-note-text" });

			const deleteBtn = noteEl.createEl("button", { cls: "clipper-semble-note-delete-btn" });
			setIcon(deleteBtn, "trash-2");
			deleteBtn.addEventListener("click", () => {
				void this.handleDeleteNote(note.uri);
			});
		}
	}

	private renderAddNoteForm(contentEl: HTMLElement) {
		const formSection = contentEl.createEl("div", { cls: "clipper-semble-detail-add-note" });
		formSection.createEl("h3", { text: "Add a note", cls: "clipper-detail-section-title" });

		const form = formSection.createEl("div", { cls: "clipper-semble-add-note-form" });

		this.noteInput = form.createEl("textarea", {
			cls: "clipper-textarea clipper-semble-note-input",
			attr: { placeholder: "Write a note about this item..." },
		});

		const addBtn = form.createEl("button", { text: "Add note", cls: "clipper-btn clipper-btn-primary" });
		addBtn.addEventListener("click", () => { void this.handleAddNote(); });
	}

	private async handleAddNote() {
		if (!this.plugin.client.loggedIn || !this.noteInput) return;

		const text = this.noteInput.value.trim();
		if (!text) {
			new Notice("Please enter a note");
			return;
		}

		try {
			await createSembleNote(
				this.plugin.client,
				this.plugin.settings.did!,
				text,
				{ uri: this.item.getUri(), cid: this.item.getCid() }
			);

			new Notice("Note added");
			this.close();
			this.onSuccess?.();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Failed to add note: ${message}`);
		}
	}

	private async handleDeleteNote(noteUri: string) {
		if (!this.plugin.client.loggedIn) return;

		const rkey = noteUri.split("/").pop();
		if (!rkey) {
			new Notice("Invalid note uri");
			return;
		}

		try {
			await deleteRecord(
				this.plugin.client,
				this.plugin.settings.did!,
				"network.cosmik.card",
				rkey
			);

			new Notice("Note deleted");
			this.close();
			this.onSuccess?.();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Failed to delete note: ${message}`);
		}
	}

	onClose() {
		this.contentEl.empty();
	}
}

function sourceIconId(source: "semble" | "bookmark" | "margin" | "tangled" | "github" | "arc"): string {
	if (source === "semble") return "clipper-semble";
	if (source === "margin") return "clipper-margin";
	if (source === "tangled") return "star";
	if (source === "github") return "github";
	if (source === "arc") return "app-window";
	return "bookmark";
}
