#!/usr/bin/env bun
// scripts/sync-tangled-stars.ts
import { config, loadState, saveState } from "./config";
import {
	writeFileToVault,
	sanitizeFileName,
	stringifyFrontmatter,
} from "./vault";

async function syncTangledStars() {
	// TODO: Tangled API integration pending
	// ATProto-based — needs API docs
	console.log("Tangled sync: API integration pending.");
	console.log(
		"Update config.tangledApiBase and implement when API docs are available.",
	);
}

if (import.meta.main) {
	syncTangledStars().catch(console.error);
}

export { syncTangledStars };
