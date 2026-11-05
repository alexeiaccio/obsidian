import { Effect } from "effect";
import type { Record } from "@atcute/atproto/types/repo/listRecords";
import { AtClient } from "../effect/AtClient";
import { SourceError } from "../effect/Errors";
import { NOTE_COLLECTION, type MarginNote } from "../effect/Highlights";
import * as Repo from "../effect/Repo";
import type { ATClient } from "../lib/client";
import type ClipperPlugin from "../main";
import { fetchOgImage } from "../util";
import type { ATBookmarkItem, CollectionAssociation, DataSource, SourceFilter } from "./types";

/**
 * Margin, read through `at.margin.note`.
 *
 * margin consolidated `at.margin.bookmark` (and highlight/annotation) into one
 * `at.margin.note` record, so a bookmark is a note whose `motivation` is
 * `"bookmarking"` — the URL moved from a top-level `source` to `target.source` and the
 * description to `body.value`.
 */
const COLLECTIONS = "at.margin.collection";
const COLLECTION_ITEMS = "at.margin.collectionItem";

type NotesRecord = Record & { value: MarginNote };

const sourceError = (cause: unknown) =>
	new SourceError({ source: "margin", message: `${NOTE_COLLECTION}: ${String(cause)}` });

const isBookmark = (record: { value: MarginNote }): boolean =>
	record.value.motivation === "bookmarking";

/** List a Margin collection; a failed list reads as none. */
const loadRecords = <T>(
	repo: string,
	collection: string,
): Effect.Effect<Array<Record & { value: T }>, never, AtClient> =>
	Repo.listRecords(repo, collection).pipe(
		Effect.map((page) => page.records as Array<Record & { value: T }>),
		Effect.orElseSucceed((): Array<Record & { value: T }> => []),
	);

const writeTags = Effect.fn("MarginSource.writeTags")(function* (
	repo: string,
	rkey: string,
	tags: string[],
) {
	const { value } = yield* Repo.getRecord<MarginNote>(repo, NOTE_COLLECTION, rkey);
	yield* Repo.putRecord(repo, NOTE_COLLECTION, rkey, { ...value, tags });
});

class MarginItem implements ATBookmarkItem {
	private record: NotesRecord;
	private plugin: ClipperPlugin;
	private collections: Array<{ uri: string; name: string; source: string }>;

	constructor(record: NotesRecord, collections: Array<{ uri: string; name: string; source: string }>, plugin: ClipperPlugin) {
		this.record = record;
		this.collections = collections;
		this.plugin = plugin;
	}

	getUri(): string {
		return this.record.uri;
	}

	getCid(): string {
		return this.record.cid;
	}

	getCreatedAt(): string {
		return this.record.value.createdAt;
	}

	getSource(): "margin" {
		return "margin";
	}

	canAddNotes(): boolean {
		return false;
	}

	canAddTags(): boolean {
		return true;
	}

	canAddToCollections(): boolean {
		return true;
	}

	canEdit(): boolean {
		return true;
	}

	getTitle(): string | undefined {
		return this.record.value.target?.title || undefined;
	}

	getDescription(): string | undefined {
		return this.record.value.body?.value || undefined;
	}

	async getImageUrl(): Promise<string | undefined> {
		const url = this.record.value.target?.source;
		return url ? fetchOgImage(url) : undefined;
	}

	getUrl(): string | undefined {
		return this.record.value.target?.source;
	}

	getSiteName(): string | undefined {
		return undefined;
	}

	getCollections(): Array<{ uri: string; name: string; source: string }> {
		return this.collections;
	}

	setCollections(collections: Array<{ uri: string; name: string; source: string }>) {
		this.collections = collections;
	}

	getTags() {
		return this.record.value.tags ? [...this.record.value.tags] : [];
	}

	getRecord() {
		return this.record;
	}
}

export class MarginSource implements DataSource {
	readonly name = "margin" as const;

	constructor(
		private readonly client: ATClient,
		private readonly repo: string,
	) {}

	/** The Promise seam: run an Effect with this source's client. */
	private run = <A, E>(effect: Effect.Effect<A, E, AtClient>): Promise<A> =>
		Effect.runPromise(effect.pipe(Effect.provideService(AtClient, this.client)));

	async fetchItems(plugin: ClipperPlugin, filteredCollections: Set<string>, filteredTags: Set<string>): Promise<ATBookmarkItem[]> {
		const notes = await this.run(loadRecords<MarginNote>(this.repo, NOTE_COLLECTION));
		let bookmarks = notes.filter(isBookmark);

		if (filteredCollections.size > 0) {
			bookmarks = bookmarks.filter((bookmark) => filteredCollections.has(bookmark.uri));
		}

		if (filteredTags.size > 0) {
			bookmarks = bookmarks.filter((record) =>
				record.value.tags?.some((tag) => filteredTags.has(tag))
			);
		}

		return bookmarks.map((record) => new MarginItem(record, [], plugin));
	}

	async getAvailableCollections(): Promise<SourceFilter[]> {
		const collections = await this.run(
			loadRecords<{ name?: string; description?: string }>(this.repo, COLLECTIONS),
		);

		return collections.map((c) => ({
			value: c.uri,
			label: c.value.name,
			description: c.value.description,
		}));
	}

	async getCollectionAssociations(): Promise<CollectionAssociation[]> {
		const items = await this.run(
			loadRecords<{ annotation: string; collection: string }>(this.repo, COLLECTION_ITEMS),
		);

		return items.map((item) => ({
			record: item.value.annotation,
			collection: item.value.collection,
			linkUri: item.uri,
		}));
	}

	async deleteItem(itemUri: string): Promise<void> {
		const rkey = itemUri.split("/").pop();
		if (!rkey) {
			throw new SourceError({ source: "margin", message: `Invalid uri: ${itemUri}` });
		}
		await this.run(Repo.deleteRecord(this.repo, NOTE_COLLECTION, rkey).pipe(Effect.mapError(sourceError)));
	}

	async addToCollection(itemUri: string, _itemCid: string, collectionUri: string): Promise<void> {
		await this.run(
			Repo.createRecord(this.repo, COLLECTION_ITEMS, {
				$type: COLLECTION_ITEMS,
				annotation: itemUri,
				collection: collectionUri,
				createdAt: new Date().toISOString(),
			}).pipe(Effect.mapError(sourceError)),
		);
	}

	async removeFromCollection(linkUri: string): Promise<void> {
		const rkey = linkUri.split("/").pop();
		if (!rkey) {
			throw new SourceError({ source: "margin", message: `Invalid link uri: ${linkUri}` });
		}
		await this.run(
			Repo.deleteRecord(this.repo, COLLECTION_ITEMS, rkey).pipe(Effect.mapError(sourceError)),
		);
	}

	async updateTags(itemUri: string, tags: string[]): Promise<void> {
		const rkey = itemUri.split("/").pop();
		if (!rkey) {
			throw new SourceError({ source: "margin", message: `Invalid uri: ${itemUri}` });
		}
		await this.run(writeTags(this.repo, rkey, tags).pipe(Effect.mapError(sourceError)));
	}

	async getAvilableTags(): Promise<SourceFilter[]> {
		const notes = await this.run(loadRecords<MarginNote>(this.repo, NOTE_COLLECTION));

		const tagSet = new Set<string>();
		for (const record of notes.filter(isBookmark)) {
			for (const tag of record.value.tags ?? []) {
				tagSet.add(tag);
			}
		}
		return Array.from(tagSet).map((tag) => ({ value: tag, label: tag }));
	}
}
