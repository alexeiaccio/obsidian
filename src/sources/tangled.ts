import { Effect } from "effect";
import type { Record } from "@atcute/atproto/types/repo/listRecords";
import { AtClient } from "../effect/AtClient";
import { getTangledStars, resolveTangledSubject, type ResolvedTangledSubject } from "../lib/bookmarks/tangled";
import type { ATClient } from "../lib/client";
import type ClipperPlugin from "../main";
import type { Main as Star } from "../lexicons/types/sh/tangled/feed/star";
import type { ATBookmarkItem, DataSource } from "./types";

type StarRecord = Record & { value: Star };

/** A failed star listing reads as none. */
const loadStars = Effect.fn("TangledSource.load")(function* (repo: string) {
	const { records } = yield* getTangledStars(repo).pipe(
		Effect.catchTag("SourceError", () => Effect.succeed({ records: [] as unknown[] })),
	);
	return records as StarRecord[];
});

class TangledItem implements ATBookmarkItem {
	private record: StarRecord;
	private resolved: ResolvedTangledSubject;

	constructor(record: StarRecord, resolved: ResolvedTangledSubject) {
		this.record = record;
		this.resolved = resolved;
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

	getSource(): "tangled" {
		return "tangled";
	}

	canAddNotes(): boolean {
		return false;
	}

	canAddTags(): boolean {
		return false;
	}

	canAddToCollections(): boolean {
		return false;
	}

	canEdit(): boolean {
		return false;
	}

	getTitle(): string | undefined {
		return this.resolved.title;
	}

	getDescription(): string | undefined {
		return this.resolved.description;
	}

	async getImageUrl(): Promise<string | undefined> {
		return undefined;
	}

	getUrl(): string | undefined {
		return this.resolved.url;
	}

	getSiteName(): string | undefined {
		return "Tangled";
	}

	getTags(): string[] {
		return [];
	}

	getCollections(): Array<{ uri: string; name: string; source: string }> {
		return [];
	}

	setCollections(): void {}

	getRecord() {
		return this.record;
	}
}

export class TangledSource implements DataSource {
	readonly name = "tangled" as const;

	constructor(
		private readonly client: ATClient,
		private readonly repo: string,
	) {}

	/** The Promise seam: run an Effect with this source's client. */
	private run = <A, E>(effect: Effect.Effect<A, E, AtClient>): Promise<A> =>
		Effect.runPromise(effect.pipe(Effect.provideService(AtClient, this.client)));

	async fetchItems(
		_plugin: ClipperPlugin,
		_filteredCollections: Set<string> | undefined,
		_filteredTags: Set<string>,
	): Promise<ATBookmarkItem[]> {
		const records = await this.run(loadStars(this.repo));

		return await this.run(
			Effect.forEach(
				records,
				(record) =>
					resolveTangledSubject(record.value.subject).pipe(
						Effect.map((resolved) => new TangledItem(record, resolved)),
					),
				{ concurrency: 5 },
			),
		);
	}
}
