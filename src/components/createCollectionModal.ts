import { Modal, Notice } from "obsidian";
import type ClipperPlugin from "../main";
import { createSembleCollection, createMarginCollection } from "../lib";

type SourceName = "semble" | "margin";

export class CreateCollectionModal extends Modal {
	plugin: ClipperPlugin;
	availableSources: SourceName[];
	selectedSource: SourceName;
	onSuccess?: () => void;

	constructor(plugin: ClipperPlugin, availableSources: SourceName[], onSuccess?: () => void) {
		super(plugin.app);
		this.plugin = plugin;
		this.availableSources = availableSources;
		this.selectedSource = availableSources[0]!;
		this.onSuccess = onSuccess;
	}

	onOpen() { this.render(); }

	private render() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("clipper-modal");
		contentEl.createEl("h2", { text: "New collection" });

		if (!this.plugin.client) {
			contentEl.createEl("p", { text: "Not connected." });
			return;
		}

		if (this.availableSources.length > 1) {
			const toggleRow = contentEl.createEl("div", { cls: "clipper-source-toggle-row" });
			for (const source of this.availableSources) {
				const btn = toggleRow.createEl("button", {
					text: source.charAt(0).toUpperCase() + source.slice(1),
					cls: "clipper-source-toggle-btn" + (this.selectedSource === source ? " is-active" : ""),
					type: "button",
				});
				btn.addEventListener("click", () => { this.selectedSource = source; this.render(); });
			}
		}

		const form = contentEl.createEl("form", { cls: "clipper-form" });

		const nameGroup = form.createEl("div", { cls: "clipper-form-group" });
		nameGroup.createEl("label", { text: "Name", attr: { for: "collection-name" } });
		const nameInput = nameGroup.createEl("input", {
			type: "text",
			cls: "clipper-input",
			attr: { id: "collection-name", placeholder: "Collection name", required: "true" },
		});

		let iconInput: HTMLInputElement | null = null;
		if (this.selectedSource === "margin") {
			const iconGroup = form.createEl("div", { cls: "clipper-form-group" });
			iconGroup.createEl("label", { text: "Icon (optional)", attr: { for: "collection-icon" } });
			iconInput = iconGroup.createEl("input", {
				type: "text",
				cls: "clipper-input",
				attr: { id: "collection-icon" },
			});
		}

		const descGroup = form.createEl("div", { cls: "clipper-form-group" });
		descGroup.createEl("label", { text: "Description", attr: { for: "collection-desc" } });
		const descInput = descGroup.createEl("textarea", {
			cls: "clipper-textarea",
			attr: { id: "collection-desc", placeholder: "Optional description", rows: "3" },
		});

		const actions = form.createEl("div", { cls: "clipper-modal-actions" });
		actions.createEl("button", {
			text: "Cancel",
			cls: "clipper-btn clipper-btn-secondary",
			type: "button",
		}).addEventListener("click", () => this.close());

		const createBtn = actions.createEl("button", {
			text: "Create",
			cls: "clipper-btn clipper-btn-primary",
			type: "submit",
		});

		form.addEventListener("submit", (e) => {
			e.preventDefault();
			void this.handleSubmit(nameInput, iconInput, descInput, createBtn);
		});

		nameInput.focus();
	}

	private async handleSubmit(
		nameInput: HTMLInputElement,
		iconInput: HTMLInputElement | null,
		descInput: HTMLTextAreaElement,
		createBtn: HTMLButtonElement
	) {
		const name = nameInput.value.trim();
		if (!name) {
			new Notice("Please enter a collection name");
			return;
		}

		createBtn.disabled = true;
		createBtn.textContent = "Creating...";

		try {
			if (this.selectedSource === "margin") {
				await createMarginCollection(
					this.plugin.client,
					this.plugin.settings.did!,
					name,
					descInput.value.trim() || undefined,
					iconInput?.value.trim() || undefined
				);
			} else {
				await createSembleCollection(
					this.plugin.client,
					this.plugin.settings.did!,
					name,
					descInput.value.trim()
				);
			}
			new Notice(`Created collection "${name}"`);
			this.close();
			this.onSuccess?.();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			new Notice(`Failed to create collection: ${message}`);
			createBtn.disabled = false;
			createBtn.textContent = "Create";
		}
	}

	onClose() { this.contentEl.empty(); }
}
