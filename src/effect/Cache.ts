import { Effect } from "effect";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname } from "path";

/**
 * A small on-disk JSON cache for fetched sources.
 *
 * Best-effort by design: a missing, stale or malformed entry reads as `undefined`
 * and a failed write is ignored, so neither can break a fetch.
 */

interface CacheEnvelope<T> {
	savedAt: number;
	value: T;
}

/** Read a cached value, or `undefined` when missing, malformed, or older than `maxAgeMs`. */
export const read = <T>(path: string, maxAgeMs: number): Effect.Effect<T | undefined> =>
	Effect.promise(async () => {
		try {
			const raw = await readFile(path, "utf8");
			const parsed = JSON.parse(raw) as CacheEnvelope<T>;
			if (!parsed || typeof parsed.savedAt !== "number") {
				return undefined;
			}
			if (Date.now() - parsed.savedAt > maxAgeMs) {
				return undefined;
			}
			return parsed.value;
		} catch {
			return undefined;
		}
	});

/** Best-effort cache write; failures are ignored (the cache is an optimization). */
export const write = <T>(path: string, value: T): Effect.Effect<void> =>
	Effect.promise(async () => {
		try {
			await mkdir(dirname(path), { recursive: true });
			const envelope: CacheEnvelope<T> = { savedAt: Date.now(), value };
			await writeFile(path, JSON.stringify(envelope));
		} catch {
			// ignore
		}
	});
