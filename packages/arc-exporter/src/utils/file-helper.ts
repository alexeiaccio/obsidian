import { type App, type TFile, TFolder } from "obsidian";
import type { ArcExporterSettings } from "../settings";

export async function getOutputFolder(
	app: App,
	settings: ArcExporterSettings,
): Promise<TFolder | null> {
	// If default is set, try to resolve it
	if (settings.defaultOutputFolder) {
		const folder = app.vault.getAbstractFileByPath(
			settings.defaultOutputFolder,
		);
		if (folder instanceof TFolder) {
			return folder;
		}
		// If not exist, create it
		await app.vault.createFolder(settings.defaultOutputFolder);
		return app.vault.getAbstractFileByPath(
			settings.defaultOutputFolder,
		) as TFolder;
	}
	// Otherwise, default to root (or implement picker modal later)
	// For now, use vault root
	return app.vault.getRoot();
}

export async function createExportFile(
	app: App,
	folder: TFolder,
	filename: string,
	content: string,
): Promise<TFile | null> {
	// Ensure filename has .md extension
	if (!filename.endsWith(".md")) {
		filename += ".md";
	}
	// Check if file exists, if so, append number
	let finalPath = `${folder.path ? `${folder.path}/` : ""}${filename}`;
	let counter = 1;
	while (await app.vault.adapter.exists(finalPath)) {
		const nameWithoutExt = filename.replace(/\.md$/, ` (${counter})`);
		finalPath = `${folder.path ? `${folder.path}/` : ""}${nameWithoutExt}.md`;
		counter++;
	}
	try {
		return await app.vault.create(finalPath, content);
	} catch (error) {
		console.error("Failed to create file:", error);
		return null;
	}
}
