#!/usr/bin/env bun
// scripts/sync-semble-margin.ts
import { loadState, saveState } from "./config";
import {
	writeFileToVault,
	sanitizeFileName,
	stringifyFrontmatter,
} from "./vault";

interface Bookmark {
	url: string;
	title: string;
	description?: string;
	tags?: string[];
	createdAt: string;
}

async function fetchSembleBookmarks(_since?: number): Promise<Bookmark[]> {
	// TODO: Semble API integration
	console.log("Semble sync: API integration pending.");
	return [];
}

async function fetchMarginBookmarks(_since?: number): Promise<Bookmark[]> {
	// TODO: Margin API integration
	console.log("Margin sync: API integration pending.");
	return [];
}

async function syncSembleMargin() {
	const state = loadState();

	const sembleBookmarks = await fetchSembleBookmarks(state.lastSembleSync);
	for (const bookmark of sembleBookmarks) {
		const fileName = `${sanitizeFileName(bookmark.title)}.md`;
		const content = stringifyFrontmatter(
			{
				source: "semble",
				url: bookmark.url,
				tags: bookmark.tags || [],
				created: bookmark.createdAt.split("T")[0],
			},
			`# ${bookmark.title}\n\n${bookmark.description || ""}\n\n[${bookmark.url}](${bookmark.url})`,
		);
		await writeFileToVault(`Links/${fileName}`, content);
	}

	const marginBookmarks = await fetchMarginBookmarks(state.lastMarginSync);
	for (const bookmark of marginBookmarks) {
		const fileName = `${sanitizeFileName(bookmark.title)}.md`;
		const content = stringifyFrontmatter(
			{
				source: "margin",
				url: bookmark.url,
				tags: bookmark.tags || [],
				created: bookmark.createdAt.split("T")[0],
			},
			`# ${bookmark.title}\n\n${bookmark.description || ""}\n\n[${bookmark.url}](${bookmark.url})`,
		);
		await writeFileToVault(`Links/${fileName}`, content);
	}

	state.lastSembleSync = Date.now();
	state.lastMarginSync = Date.now();
	saveState(state);

	console.log(
		`Synced ${sembleBookmarks.length} Semble + ${marginBookmarks.length} Margin bookmarks.`,
	);
}

if (import.meta.main) {
	syncSembleMargin().catch(console.error);
}

export { syncSembleMargin };
