import { Effect } from "effect";
import {
	ItemView,
	MarkdownRenderer,
	Notice,
	setIcon,
	type ViewStateResult,
	type WorkspaceLeaf,
} from "obsidian";
import { AtClient } from "../effect/AtClient";
import { save as saveMarginNote } from "../effect/Highlights";
import { read, type ReaderResult } from "../effect/Reader";
import { createSembleNote } from "../lib/bookmarks/cosmik";
import type ClipperPlugin from "../main";

export const VIEW_TYPE_CLIPPER_READER = "clipper-reader";

/** Reveal the reader pane for `url`, reusing an existing one when present. */
export const openReader = async (plugin: ClipperPlugin, url: string): Promise<void> => {
	const { workspace } = plugin.app;
	const existing = workspace.getLeavesOfType(VIEW_TYPE_CLIPPER_READER)[0];
	const leaf = existing ?? workspace.getLeaf("tab");
	await leaf.setViewState({ type: VIEW_TYPE_CLIPPER_READER, active: true, state: { url } });
	void workspace.revealLeaf(leaf);
};

/** The `url` a clipped note was made from, if it has one. */
export const sourceUrlOf = (plugin: ClipperPlugin, file = plugin.app.workspace.getActiveFile()) => {
	if (!file) {
		return undefined;
	}
	const url = plugin.app.metadataCache.getFileCache(file)?.frontmatter?.["url"];
	return typeof url === "string" && url.length > 0 ? url : undefined;
};

const messageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * A reader pane for one link's source page.
 *
 * Reading is `effect/Reader`. Selecting text raises a small annotation popover —
 * write a note with the selection and save it to Margin as an annotation, or clip the
 * selection into the note. The toolbar does the same without a note.
 */
export class ReaderView extends ItemView {
	private plugin: ClipperPlugin;
	private url?: string;
	private result?: ReaderResult;
	private popover?: HTMLElement;
	private selectionTimer?: number;

	constructor(leaf: WorkspaceLeaf, plugin: ClipperPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_CLIPPER_READER;
	}

	getDisplayText(): string {
		return "Source reader";
	}

	getIcon(): string {
		return "newspaper";
	}

	getState() {
		return { url: this.url };
	}

	async onOpen(): Promise<void> {
		const doc = this.contentEl.ownerDocument;
		this.registerDomEvent(doc, "selectionchange", () => this.handleSelection());
		this.registerDomEvent(doc, "mousedown", (event) => {
			const target = event.target as Node | null;
			if (this.popover && target && !this.popover.contains(target)) {
				this.hidePopover();
			}
		});
		this.registerDomEvent(doc, "keydown", (event) => {
			if (event.key === "Escape") {
				this.hidePopover();
			}
		});
	}

	async onClose(): Promise<void> {
		if (this.selectionTimer !== undefined) {
			window.clearTimeout(this.selectionTimer);
			this.selectionTimer = undefined;
		}
		this.hidePopover();
		this.contentEl.empty();
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		await super.setState(state, result);
		const url = (state as { url?: string } | null)?.url;
		// Only re-render when the page actually changed: Obsidian re-applies view state
		// for its own reasons, and re-rendering wipes the DOM — and with it any text
		// selection the reader was in the middle of making.
		if (url && url !== this.url) {
			this.url = url;
			await this.render(url);
		}
	}

	/** The text selected inside this pane, if any. */
	private selectedText(): string {
		const selection = this.contentEl.ownerDocument.getSelection();
		const anchor = selection?.anchorNode;
		if (!selection || !anchor || !this.contentEl.contains(anchor)) {
			return "";
		}
		return selection.toString().trim();
	}

	private async render(url: string) {
		const { contentEl } = this;
		this.hidePopover();
		contentEl.empty();
		contentEl.addClass("clipper-reader");
		contentEl.createEl("p", { text: `Reading ${url}…` });

		let result: ReaderResult;
		try {
			result = await Effect.runPromise(read(url));
		} catch (error) {
			contentEl.empty();
			contentEl.createEl("p", { text: `Could not read this page.` });
			contentEl.createEl("p", { text: messageOf(error), cls: "clipper-reader-error" });
			return;
		}

		this.result = result;
		contentEl.empty();

		const header = contentEl.createDiv({ cls: "clipper-reader-header" });
		header.createEl("h2", { text: result.title });
		const meta = [result.site, result.author, result.published, `${result.wordCount} words`]
			.filter((part): part is string => typeof part === "string" && part.length > 0)
			.join(" · ");
		if (meta) {
			header.createEl("p", { text: meta, cls: "clipper-reader-meta" });
		}
		header.createEl("a", { text: "Open original", href: result.url });

		this.renderToolbar(contentEl, result);

		const body = contentEl.createDiv({ cls: "clipper-reader-body" });
		await MarkdownRenderer.render(this.app, result.markdown, body, "", this);

		contentEl.createEl("p", {
			text: "Select text to annotate it.",
			cls: "clipper-reader-hint",
		});
	}

	private renderToolbar(parent: HTMLElement, result: ReaderResult) {
		const bar = parent.createDiv({ cls: "clipper-reader-toolbar" });

		const button = (label: string, icon: string, onClick: () => void) => {
			const element = bar.createEl("button", { cls: "clipper-reader-action" });
			setIcon(element, icon);
			element.createSpan({ text: label });
			// Without this the button takes focus on mousedown, which collapses the
			// selection before the click handler can read it.
			element.addEventListener("mousedown", (event) => event.preventDefault());
			element.addEventListener("click", onClick);
		};

		button("Clip page", "book-open", () => void this.clipPage(result));
		button("Clip selection", "quote", () => void this.clipPage(result, this.selectedText()));
		button("Copy selection", "copy", () => void this.copySelection());
		button("Save to Semble", "message-square-plus", () => void this.saveToSemble(result));
	}

	// ---------------------------------------------------------------- annotations

	/**
	 * `selectionchange` fires for every character of a drag, so waiting for the selection to
	 * settle is what makes a multi-word selection possible at all: showing the popover (and
	 * focusing its field) mid-drag interrupts the selection after the first character.
	 */
	private handleSelection() {
		if (this.selectionTimer !== undefined) {
			window.clearTimeout(this.selectionTimer);
		}
		this.selectionTimer = window.setTimeout(() => {
			this.selectionTimer = undefined;
			this.showForCurrentSelection();
		}, 250);
	}

	private showForCurrentSelection() {
		const selection = this.contentEl.ownerDocument.getSelection();
		const anchor = selection?.anchorNode;
		if (!selection || !anchor || selection.isCollapsed || !this.contentEl.contains(anchor)) {
			return;
		}
		const text = selection.toString().trim();
		if (text.length === 0) {
			return;
		}

		const range = selection.getRangeAt(0);
		if (this.popover?.contains(range.commonAncestorContainer)) {
			return;
		}
		this.showPopover(text, range.getBoundingClientRect());
	}

	private showPopover(text: string, rect: DOMRect) {
		const result = this.result;
		if (!result) {
			return;
		}
		this.hidePopover();

		const doc = this.contentEl.ownerDocument;
		const popover = doc.body.createDiv({ cls: "clipper-annotation" });
		popover.createEl("p", {
			text: text.length > 160 ? `${text.slice(0, 160)}…` : text,
			cls: "clipper-annotation-quote",
		});

		const note = popover.createEl("textarea", {
			cls: "clipper-annotation-input",
			attr: { placeholder: "Add a note…", rows: "3" },
		});

		const actions = popover.createDiv({ cls: "clipper-annotation-actions" });
		const action = (label: string, cls: string, onClick: () => void) => {
			const element = actions.createEl("button", { text: label, cls });
			element.addEventListener("click", onClick);
		};

		action("Save to Margin", "mod-cta", () => void this.annotate(result, text, note.value));
		action("Clip", "", () => void this.clipPage(result, text, note.value));
		action("Copy", "", () => {
			void navigator.clipboard.writeText(text);
			new Notice("Selection copied");
		});

		// Keep it on screen: fixed positioning, clamped to the viewport.
		const width = 300;
		popover.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
		popover.style.top = `${Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 160))}px`;
		popover.style.width = `${width}px`;

		this.popover = popover;
		note.focus();
	}

	private hidePopover() {
		this.popover?.remove();
		this.popover = undefined;
	}

	// ------------------------------------------------------------------- actions

	private async clipPage(result: ReaderResult, selection?: string, note?: string) {
		try {
			await this.plugin.clipper.clipPage(result, selection, note);
			this.hidePopover();
		} catch (error) {
			new Notice(`Could not clip: ${messageOf(error)}`);
		}
	}

	/** margin writes one record for all three: the motivation is what differs. */
	private async annotate(result: ReaderResult, text: string, note: string) {
		const did = this.plugin.settings.did;
		if (!did) {
			new Notice("Log in to save to Margin.");
			return;
		}
		const comment = note.trim();
		try {
			await Effect.runPromise(
				saveMarginNote(did, {
					url: result.url,
					motivation: comment.length > 0 ? "commenting" : "highlighting",
					title: result.title,
					exact: text,
					...(comment.length > 0 ? { note: comment } : {}),
				}).pipe(Effect.provideService(AtClient, this.plugin.client)),
			);
			new Notice(comment.length > 0 ? "Saved annotation to Margin" : "Saved highlight to Margin");
			this.hidePopover();
		} catch (error) {
			new Notice(`Could not save to Margin: ${messageOf(error)}`);
		}
	}

	private async saveToSemble(result: ReaderResult) {
		const did = this.plugin.settings.did;
		if (!did) {
			new Notice("Log in to save to Semble.");
			return;
		}
		const text = this.selectedText();
		try {
			await Effect.runPromise(
				createSembleNote(did, text || `${result.title}\n${result.url}`).pipe(
					Effect.provideService(AtClient, this.plugin.client),
				),
			);
			new Notice(text ? "Saved the selection to Semble" : "Saved the page to Semble");
		} catch (error) {
			new Notice(`Could not save to Semble: ${messageOf(error)}`);
		}
	}

	private async copySelection() {
		const text = this.selectedText();
		if (!text) {
			new Notice("Select some text first.");
			return;
		}
		await navigator.clipboard.writeText(text);
		new Notice("Selection copied");
	}
}
