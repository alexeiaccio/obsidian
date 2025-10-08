import { App, TFile, TFolder, Notice } from "obsidian";
import type { StarredRepository } from "../github/types";
import { generateDefaultFileName, createBacklinkIndex } from "../formatters/markdown";

export async function getOutputFolder(
	app: App,
	settings: { defaultOutputFolder: string },
): Promise<TFolder> {
	const folderPath = settings.defaultOutputFolder.trim();

	if (!folderPath) {
		// Ask user to select folder
		const folder = app.vault.getAbstractFileByPath("");
		if (!folder || !(folder instanceof TFolder)) {
			throw new Error("Cannot access vault root");
		}
		return folder;
	}

	// Try to get or create the specified folder
	let folder = app.vault.getAbstractFileByPath(folderPath);

	if (!folder) {
		// Create folder if it doesn't exist
		await app.vault.createFolder(folderPath);
		folder = app.vault.getAbstractFileByPath(folderPath);
	}

	if (!folder || !(folder instanceof TFolder)) {
		throw new Error(`Unable to access or create folder: ${folderPath}`);
	}

	return folder;
}

export async function createExportFile(
	app: App,
	folder: TFolder,
	filename: string,
	content: string,
): Promise<TFile | null> {
	try {
		const filePath = folder.path ? `${folder.path}/${filename}` : filename;

		// Check if file already exists
		const existingFile = app.vault.getAbstractFileByPath(filePath);

		if (existingFile instanceof TFile) {
			// Update existing file
			await app.vault.modify(existingFile, content);
			return existingFile;
		} else {
			// Create new file
			const file = await app.vault.create(filePath, content);
			return file;
		}
	} catch (error) {
		console.error(`Failed to create file ${filename}:`, error);
		new Notice(`Failed to create file: ${filename}`);
		return null;
	}
}

export async function createOrUpdateRepositoryFile(
	app: App,
	folder: TFolder,
	repo: StarredRepository,
	content: string,
): Promise<TFile | null> {
	const filename = generateDefaultFileName(repo);
	return createExportFile(app, folder, filename, content);
}

export async function createOrUpdateIndexFile(
	app: App,
	folder: TFolder,
	repositories: StarredRepository[],
): Promise<TFile | null> {
	const indexContent = createBacklinkIndex(repositories);
	return createExportFile(app, folder, "GitHub Stars Index.md", indexContent);
}

export function sanitizeFileName(fileName: string): string {
	return fileName
		.replace(/[<>:"/\\|?*]/g, "-")
		.replace(/\s+/g, " ")
		.trim();
}