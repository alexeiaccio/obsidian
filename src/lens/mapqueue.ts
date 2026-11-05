/**
 * Map lens bridge: write a machine-readable queue of the user's saved links next
 * to the selected tldraw file.
 *
 * The plugin cannot write `.tldraw` itself — that file is a zip in tldraw's own
 * serialization, and bundling tldraw into an Obsidian plugin is not reasonable.
 * The vault's agent already drives the map (via the tldraw offline API), so the
 * plugin's job is to hand it a clean queue and stay out of the file format.
 */
import { Effect } from "effect";
import type { Scope } from "effect";
import { normalizePath } from "obsidian";
import { notify } from "../effect/Notice";
import * as Plugin from "../effect/Plugin";
import { Vault } from "../effect/Vault";

export interface MapRef {
	readonly url: string;
	readonly title?: string;
	readonly source: string;
	readonly tags?: string[];
}

export interface MapRefQueue {
	readonly map: string;
	readonly generatedAt: string;
	readonly refs: readonly MapRef[];
}

/** `docs/map.tldraw` -> `docs/_map-refs.json`. */
export const mapRefsPath = (mapFile: string): string => {
	const slash = mapFile.lastIndexOf("/");
	const dir = slash === -1 ? "" : mapFile.slice(0, slash);
	return normalizePath(`${dir ? `${dir}/` : ""}_map-refs.json`);
};

/** Register "Write link queue for the map", shown once a tldraw file is selected. */
export const mapQueueCommand = (params: {
	readonly getRefs: () => Promise<MapRef[]>;
	readonly getMapFile: () => string | undefined;
}): Effect.Effect<void, never, Plugin.Plugin | Scope.Scope | Vault> =>
	Plugin.addCommand({
		id: "write-map-refs",
		name: "Write link queue for the map",
		check: Effect.sync(() => params.getMapFile() !== undefined),
		run: Effect.gen(function* () {
			const vault = yield* Vault;

			const mapFile = params.getMapFile();
			if (!mapFile) {
				yield* notify("Pick a tldraw file in settings first.");
				return;
			}

			const refs = yield* Effect.promise(() => params.getRefs());
			if (refs.length === 0) {
				yield* notify("No saved links to queue.");
				return;
			}

			const queue: MapRefQueue = {
				map: mapFile,
				generatedAt: new Date().toISOString(),
				refs,
			};
			const path = mapRefsPath(mapFile);
			const payload = `${JSON.stringify(queue, null, 2)}\n`;

			const existing = vault.file(path);
			if (existing) {
				yield* vault.modify(existing, payload);
			} else {
				yield* vault.create(path, payload);
			}

			yield* notify(`Queued ${refs.length} refs for ${mapFile} in ${path}`);
		}),
	});
