import { Effect } from "effect";
import type { Record } from "@atcute/atproto/types/repo/listRecords";
import { AtClient } from "./effect/AtClient";
import * as Repo from "./effect/Repo";
import * as Community from "./lib/bookmarks/community";
import * as Cosmik from "./lib/bookmarks/cosmik";
import * as Margin from "./lib/bookmarks/margin";
import type { ATClient } from "./lib/client";

/**
 * The plugin's Promise seam.
 *
 * Everything under `effect/` and `lib/bookmarks/` is Effect-native. The vendored
 * UI (views, components, commands) still awaits, so the handful of functions it
 * calls are wrapped here with a single `runPromise`. New logic should use the
 * Effect modules directly.
 */

const run = <A, E>(client: ATClient, effect: Effect.Effect<A, E, AtClient>): Promise<A> =>
	Effect.runPromise(effect.pipe(Effect.provideService(AtClient, client)));

export const deleteRecord = (
	client: ATClient,
	repo: string,
	collection: string,
	rkey: string,
): Promise<void> => run(client, Repo.deleteRecord(repo, collection, rkey));

export const createTag = (client: ATClient, repo: string, value: string): Promise<void> =>
	run(client, Community.createTag(repo, value));

export const createSembleCollection = (
	client: ATClient,
	repo: string,
	name: string,
	description: string,
): Promise<void> => run(client, Cosmik.createSembleCollection(repo, name, description));

export const createSembleNote = (
	client: ATClient,
	repo: string,
	text: string,
	parentCard?: { uri: string; cid: string },
): Promise<void> => run(client, Cosmik.createSembleNote(repo, text, parentCard));

export const createMarginCollection = (
	client: ATClient,
	repo: string,
	name: string,
	description?: string,
	icon?: string,
): Promise<void> => run(client, Margin.createMarginCollection(repo, name, description, icon));

export type ATRecord<T> = Record & { value: T };

export {
	getPublicationDocuments,
	createDocument,
	putDocument,
	getPublication,
	getPublications,
	getSubscribedPublications,
	createPublication,
	buildDocumentUrl
} from "./lib/standardsite";

export {
	stripMarkdown,
	markdownToLeafletContent,
	markdownToPcktContent,
	resolveWikilinks,
} from "./lib/markdown";
