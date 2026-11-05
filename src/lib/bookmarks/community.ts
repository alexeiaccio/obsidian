import { Effect } from "effect";
import { SourceError } from "../../effect/Errors";
import * as Repo from "../../effect/Repo";

/**
 * Effect-native `community.lexicon.bookmarks.*` records.
 *
 * Only the functions the UI still calls are kept; the reads now live in
 * `sources/community.ts` against `effect/Repo`. The Promise seam is `lib.ts`.
 */

const sourceError = (cause: { message: string }) =>
	new SourceError({ source: "bookmark", message: `com.kipclip.tag: ${cause.message}` });

export const createTag = (repo: string, value: string) =>
	Repo.createRecord(repo, "com.kipclip.tag", {
		$type: "com.kipclip.tag",
		value,
		createdAt: new Date().toISOString(),
	}).pipe(Effect.mapError(sourceError));
