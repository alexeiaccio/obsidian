// scripts/config.ts
import { homedir } from "node:os";
import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

export const config = {
	vaultPath: resolve(
		homedir(),
		"Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes",
	),
	linksPath: "Links",
	arcJsonPath: resolve(
		homedir(),
		"Library/Application Support/Arc/StorableSidebar.json",
	),
	githubToken: process.env.GITHUB_TOKEN || "",
	tangledApiBase: "https://tangled.sh/api",
	sembleApiBase: "https://semble.sh/api",
	marginApiBase: "https://margin.com/api",
	stateFile: resolve(
		homedir(),
		"Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes/.sync-state.json",
	),
};

export interface SyncState {
	lastGithubSync: number;
	lastTangledSync: number;
	lastSembleSync: number;
	lastMarginSync: number;
	lastArcSync: number;
}

const DEFAULT_STATE: SyncState = {
	lastGithubSync: 0,
	lastTangledSync: 0,
	lastSembleSync: 0,
	lastMarginSync: 0,
	lastArcSync: 0,
};

export function loadState(): SyncState {
	try {
		const data = readFileSync(config.stateFile, "utf-8");
		return { ...DEFAULT_STATE, ...JSON.parse(data) };
	} catch {
		return { ...DEFAULT_STATE };
	}
}

export function saveState(state: SyncState): void {
	writeFileSync(config.stateFile, JSON.stringify(state, null, 2));
}
