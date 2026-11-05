import { Effect } from "effect";
import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import { SourceError } from "../effect/Errors";

/** Arc's sidebar store. macOS only (the plugin is desktop-only). */
const SIDEBAR_PATH = join(
	homedir(),
	"Library/Application Support/Arc/StorableSidebar.json",
);

/** Arc timestamps are CoreFoundation seconds (2001-01-01), not Unix. */
const CF_EPOCH_OFFSET = 978307200;

export interface ArcTab {
	id: string;
	url: string;
	title?: string;
	/** Unix seconds of last activity, if known. */
	lastActiveAt?: number;
}

interface ArcSidebarItem {
	id?: string;
	createdAt?: number;
	data?: {
		tab?: {
			savedURL?: string;
			savedTitle?: string;
			timeLastActiveAt?: number;
		};
	};
}

interface ArcSidebarFile {
	sidebar?: { containers?: Array<{ items?: ArcSidebarItem[] }> };
}

/**
 * Tabs from every Arc space (pinned and open), newest activity first.
 *
 * ponytail: parses the whole 6 MB sidebar on each fetch and returns the newest
 * `limit`. Fine at view-open cadence; cache by file mtime if it ever feels slow.
 */
export const readArcTabs = Effect.fn("Arc.readTabs")(function* (limit: number) {
	// A missing sidebar (no Arc, wrong platform) reads as no tabs.
	const raw = yield* Effect.tryPromise({
		try: () => readFile(SIDEBAR_PATH, "utf8"),
		catch: () => new SourceError({ source: "arc", message: `cannot read ${SIDEBAR_PATH}` }),
	}).pipe(Effect.catchTag("SourceError", () => Effect.void));
	if (raw === undefined) {
		return [];
	}

	const parsed = yield* Effect.try({
		try: () => JSON.parse(raw) as ArcSidebarFile,
		catch: (cause) =>
			new SourceError({ source: "arc", message: `parse sidebar: ${String(cause)}` }),
	});
	const containers = parsed.sidebar?.containers ?? [];

	const tabs: ArcTab[] = [];
	for (const container of containers) {
		for (const item of container.items ?? []) {
			const tab = item?.data?.tab;
			const url = tab?.savedURL;
			if (!url || !/^https?:\/\//i.test(url)) {
				continue;
			}
			const stamp = tab?.timeLastActiveAt ?? item.createdAt;
			tabs.push({
				id: item.id ?? url,
				url,
				title: tab?.savedTitle || undefined,
				lastActiveAt: stamp ? stamp + CF_EPOCH_OFFSET : undefined,
			});
		}
	}

	tabs.sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0));
	return tabs.slice(0, limit);
});
