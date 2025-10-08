import { App, Modal, Setting } from "obsidian";

export interface ProgressModalOptions {
	title: string;
	total?: number;
	cancellable?: boolean;
	onCancel?: () => void;
}

export class ProgressModal extends Modal {
	private progressEl: HTMLElement;
	private messageEl: HTMLElement;
	private cancelButton: HTMLButtonElement;
	private _total: number;
	private _current: number = 0;
	private _cancelled: boolean = false;

	constructor(app: App, private options: ProgressModalOptions) {
		super(app);
		this._total = options.total || 0;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("github-stars-exporter-progress");

		contentEl.createEl("h2", { text: this.options.title });

		this.messageEl = contentEl.createDiv();
		this.messageEl.setText("Starting...");

		if (this._total > 0) {
			const progressContainer = contentEl.createDiv();
			progressContainer.createEl("span", { text: "Progress: " });

			this.progressEl = progressContainer.createEl("span");
			this.progressEl.setText("0 / " + this._total);
		}

		// Cancel button if cancellable
		if (this.options.cancellable) {
			new Setting(contentEl)
				.addButton(btn => {
					this.cancelButton = btn.buttonEl;
					btn.setButtonText("Cancel")
						.onClick(() => {
							this._cancelled = true;
							if (this.options.onCancel) {
								this.options.onCancel();
							}
							this.close();
						});
				});
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	updateProgress(current: number, message?: string): void {
		this._current = current;

		if (this._total > 0 && this.progressEl) {
			this.progressEl.setText(`${current} / ${this._total}`);
		}

		if (message && this.messageEl) {
			this.messageEl.setText(message);
		}
	}

	setMessage(message: string): void {
		if (this.messageEl) {
			this.messageEl.setText(message);
		}
	}

	isCancelled(): boolean {
		return this._cancelled;
	}

	get progress(): number {
		return this._current;
	}

	get total(): number {
		return this._total;
	}
}