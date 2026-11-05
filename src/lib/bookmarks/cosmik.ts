import { Effect } from "effect";
import { SourceError } from "../../effect/Errors";
import * as Repo from "../../effect/Repo";

/**
 * Effect-native `network.cosmik.*` (Semble) records.
 *
 * Only the creates the UI still calls are kept; the reads live in
 * `sources/semble.ts`, which needs its own pagination. The Promise seam is `lib.ts`.
 */

const COLLECTION = "network.cosmik.collection";
const CARD = "network.cosmik.card";

const sourceError = (cause: { message: string }) =>
	new SourceError({ source: "semble", message: `${cause.message}` });

export const createSembleCollection = (repo: string, name: string, description: string) =>
	Repo.createRecord(
		repo,
		COLLECTION,
		{
			$type: COLLECTION,
			name,
			description,
			accessType: "CLOSED",
			createdAt: new Date().toISOString(),
		},
		false,
	).pipe(Effect.mapError(sourceError));

export const createSembleNote = (
	repo: string,
	text: string,
	parentCard?: { uri: string; cid: string },
) =>
	Repo.createRecord(repo, CARD, {
		$type: CARD,
		type: "NOTE",
		content: {
			$type: "network.cosmik.card#noteContent",
			text,
		},
		// Only set parentCard as per Semble documentation
		parentCard: parentCard ? { uri: parentCard.uri, cid: parentCard.cid } : undefined,
		createdAt: new Date().toISOString(),
	}).pipe(Effect.mapError(sourceError));
