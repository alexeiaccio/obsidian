#!/usr/bin/env bun
// scripts/sync-arc.ts
import { parseArcJson, flattenItems } from "../src/arc-parser";
import type { ArcSidebarModel } from "../src/arc-model";
import { config, loadState, saveState } from "./config";
import {
	writeFileToVault,
	sanitizeFileName,
	stringifyFrontmatter,
} from "./vault";

interface ArcCliConfig {
	spaces?: string[];
}

async function syncArc(cliConfig: ArcCliConfig = {}) {
	console.log("Parsing Arc sidebar...");
	let model: ArcSidebarModel;
	try {
		model = await parseArcJson(config.arcJsonPath);
	} catch (err) {
		console.error(`Failed to read Arc JSON at ${config.arcJsonPath}`);
		console.error("Is Arc installed and running?");
		throw err;
	}

	if (model.spaces.length === 0) {
		console.log("No Arc spaces found.");
		return;
	}

	const spacesToExport = cliConfig.spaces?.length
		? model.spaces.filter((s) => cliConfig.spaces?.includes(s.title))
		: model.spaces;

	console.log(`Exporting ${spacesToExport.length} space(s)...`);

	let exportedCount = 0;
	const today = new Date().toISOString().split("T")[0];

	for (const space of spacesToExport) {
		for (const item of flattenItems(space.item)) {
			if (!item.url) continue;
			const fileName = `${sanitizeFileName(item.title || "untitled")}.md`;
			const content = stringifyFrontmatter(
				{
					source: "arc",
					url: item.url,
					arc_space: space.title,
					tags: [] as string[],
					created: today,
				},
				`# ${item.title}\n\nSaved from Arc browser space: **${space.title}**\n\n[${item.url}](${item.url})`,
			);

			await writeFileToVault(`Links/${fileName}`, content);
			exportedCount++;
		}
	}

	const state = loadState();
	state.lastArcSync = Date.now();
	saveState(state);

	console.log(`Exported ${exportedCount} items from Arc.`);
}

if (import.meta.main) {
	syncArc().catch(console.error);
}

export { syncArc };
