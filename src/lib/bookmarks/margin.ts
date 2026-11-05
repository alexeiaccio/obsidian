import { Effect } from "effect";
import { SourceError } from "../../effect/Errors";
import * as Repo from "../../effect/Repo";

/**
 * Effect-native `at.margin.*` records.
 *
 * Only the create the UI calls is kept; the reads and writes live in
 * `sources/margin.ts`. The Promise seam is `lib.ts`.
 */

const COLLECTION = "at.margin.collection";

const sourceError = (cause: { message: string }) =>
	new SourceError({ source: "margin", message: `${COLLECTION}: ${cause.message}` });

export const createMarginCollection = (
	repo: string,
	name: string,
	description?: string,
	icon?: string,
) =>
	Repo.createRecord(repo, COLLECTION, {
		$type: COLLECTION,
		name,
		description,
		icon,
		createdAt: new Date().toISOString(),
	}).pipe(Effect.mapError(sourceError));
