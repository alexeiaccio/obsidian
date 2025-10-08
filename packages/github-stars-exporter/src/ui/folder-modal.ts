import { App, FuzzySuggestModal, TFolder } from "obsidian";

export class FolderSelectorModal extends FuzzySuggestModal<TFolder> {
	private onChoose: (folder: TFolder) => void;

	constructor(app: App, onChoose: (folder: TFolder) => void) {
		super(app);
		this.onChoose = onChoose;
	}

	getItems(): TFolder[] {
		const folders: TFolder[] = [];

		const processFolder = (folder: TFolder) => {
			folders.push(folder);
			folder.children.forEach(child => {
				if (child instanceof TFolder) {
					processFolder(child);
				}
			});
		};

		// Start from root
		const rootFolder = this.app.vault.getRoot();
		processFolder(rootFolder);

		return folders;
	}

	getItemText(item: TFolder): string {
		return item.path;
	}

	onChooseItem(item: TFolder, evt: MouseEvent | KeyboardEvent): void {
		this.onChoose(item);
	}
}