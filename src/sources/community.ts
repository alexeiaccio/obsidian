import { Effect } from "effect";
import type { Record } from "@atcute/atproto/types/repo/listRecords";
import { AtClient } from "../effect/AtClient";
import { SourceError } from "../effect/Errors";
import * as Repo from "../effect/Repo";
import type { ATClient } from "../lib/client";
import type ClipperPlugin from "../main";
import type { Main as Bookmark } from "../lexicons/types/community/lexicon/bookmarks/bookmark";
import { fetchOgImage } from "../util";
import type { ATBookmarkItem, DataSource, SourceFilter } from "./types";

const COLLECTION = "community.lexicon.bookmarks.bookmark";

/**
 * The published `community.lexicon.bookmarks.bookmark` defines only `subject`, `tags` and
 * `createdAt` — there is no `title`, `description` or `enriched`. Those are what this plugin
 * (and records written by it) carry anyway, and atproto records are open, so reads stay
 * lenient rather than dropping enrichment that really is on disk.
 */
type LegacyBookmark = Bookmark & {
	title?: string;
	description?: string;
	enriched?: {
		title?: string;
		description?: string;
		image?: string;
		thumb?: string;
		siteName?: string;
	};
};

type BookmarkRecord = Record & { value: LegacyBookmark };

const sourceError = (cause: unknown) =>
	new SourceError({ source: "bookmark", message: `community.lexicon.bookmarks.bookmark: ${String(cause)}` });

/** List the repo's bookmarks; a failed list reads as none. */
const loadBookmarks = Effect.fn("BookmarkSource.load")(function* (repo: string) {
	const { records } = yield* Repo.listRecords(repo, COLLECTION).pipe(
		Effect.catchTag("RepoError", () => Effect.succeed({ records: [] as unknown[] })),
	);
	return records as BookmarkRecord[];
});

const writeTags = Effect.fn("BookmarkSource.writeTags")(function* (
	repo: string,
	rkey: string,
	tags: string[],
) {
	const { value } = yield* Repo.getRecord<Bookmark>(repo, COLLECTION, rkey);
	yield* Repo.putRecord(repo, COLLECTION, rkey, { ...value, tags });
});

class BookmarkItem implements ATBookmarkItem {
	private record: BookmarkRecord;
	private plugin: ClipperPlugin;
	private collections: Array<{ uri: string; name: string; source: string }> = [];

	constructor(record: BookmarkRecord, plugin: ClipperPlugin) {
		this.record = record;
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

	getSource(): "bookmark" {
		return "bookmark";
	}

	canAddNotes(): boolean {
		return false;
	}

	canEdit(): boolean {
		return true;
	}

	getCollections(): Array<{ uri: string; name: string; source: string }> {
		return this.collections;
	}

	setCollections(collections: Array<{ uri: string; name: string; source: string }>) {
		this.collections = collections;
	}

	canAddTags(): boolean {
		return true;
	}

	canAddToCollections(): boolean {
		return false;
	}

	getTitle(): string | undefined {
		const enriched = this.record.value.enriched;
		return enriched?.title || this.record.value.title || undefined;
	}

	getDescription(): string | undefined {
		const enriched = this.record.value.enriched;
		return enriched?.description || this.record.value.description || undefined;
	}

	async getImageUrl(): Promise<string | undefined> {
		const enriched = this.record.value.enriched;
		if (enriched?.image) {
			return enriched.image;
		} else if (enriched?.thumb) {
			return enriched.thumb;
		} else {
			return await fetchOgImage(this.record.value.subject);
		}
	}

	getUrl(): string | undefined {
		return this.record.value.subject;
	}

	getSiteName(): string | undefined {
		return this.record.value.enriched?.siteName || undefined;
	}

	getTags(): string[] {
		return this.record.value.tags || [];
	}

	getRecord() {
		return this.record;
	}
}

export class BookmarkSource implements DataSource {
	readonly name = "bookmark" as const;

	constructor(
		private readonly client: ATClient,
		private readonly repo: string,
	) {}

	/** The Promise seam: run an Effect with this source's client. */
	private run = <A, E>(effect: Effect.Effect<A, E, AtClient>): Promise<A> =>
		Effect.runPromise(effect.pipe(Effect.provideService(AtClient, this.client)));

	async fetchItems(
		plugin: ClipperPlugin,
		_filteredCollections: Set<string> | undefined,
		filteredTags: Set<string>,
	): Promise<ATBookmarkItem[]> {
		const bookmarks = await this.run(loadBookmarks(this.repo));

		// no collections for community bookmarks
		const filtered =
			filteredTags.size > 0
				? bookmarks.filter((record) => record.value.tags?.some((tag) => filteredTags.has(tag)))
				: bookmarks;

		return filtered.map((record) => new BookmarkItem(record, plugin));
	}

	async deleteItem(itemUri: string): Promise<void> {
		const rkey = itemUri.split("/").pop();
		if (!rkey) {
			throw new SourceError({ source: "bookmark", message: `Invalid uri: ${itemUri}` });
		}
		await this.run(Repo.deleteRecord(this.repo, COLLECTION, rkey).pipe(Effect.mapError(sourceError)));
	}

	async updateTags(itemUri: string, tags: string[]): Promise<void> {
		const rkey = itemUri.split("/").pop();
		if (!rkey) {
			throw new SourceError({ source: "bookmark", message: `Invalid uri: ${itemUri}` });
		}
		await this.run(writeTags(this.repo, rkey, tags).pipe(Effect.mapError(sourceError)));
	}

	async getAvilableTags(): Promise<SourceFilter[]> {
		const bookmarks = await this.run(loadBookmarks(this.repo));

		const tagSet = new Set<string>();
		for (const record of bookmarks) {
			for (const tag of record.value.tags ?? []) {
				tagSet.add(tag);
			}
		}

		return Array.from(tagSet).map((tag) => ({ value: tag, label: tag }));
	}
}
