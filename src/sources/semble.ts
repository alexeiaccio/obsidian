import { Effect } from "effect";
import type { Record } from "@atcute/atproto/types/repo/listRecords";
import * as Cache from "../effect/Cache";
import { AtClient } from "../effect/AtClient";
import { SourceError } from "../effect/Errors";
import * as Repo from "../effect/Repo";
import type { ATClient } from "../lib/client";
import type ClipperPlugin from "../main";
import type { Main as Card, NoteContent, UrlContent } from "../lexicons/types/network/cosmik/card";
import type { Main as Collection } from "../lexicons/types/network/cosmik/collection";
import type { Main as CollectionLink } from "../lexicons/types/network/cosmik/collectionLink";
import type { Main as Connection } from "../lexicons/types/network/cosmik/connection";
import { fetchOgImage } from "../util";
import type { ATBookmarkItem, CollectionAssociation, ConnectionInfo, DataSource, SourceFilter } from "./types";

type CardRecord = Record & { value: Card };
type CollectionRecord = Record & { value: Collection };
type CollectionLinkRecord = Record & { value: CollectionLink };
type ConnectionRecord = Record & { value: Connection };
type RawRecord = Record & { value: unknown };

interface SembleCache {
	cards: CardRecord[];
	connections: ConnectionRecord[];
}

/** Cards are fetched page-by-page (hundreds of records); keep them warm on disk. */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Follow `listRecords` pagination to the end (capped).
 *
 * The source used to read only the first page (100 records), which silently hid
 * everything past it — 648 cards here, so connections never matched a card.
 *
 * 25 per page, not 100: the PDS that hosts this account stalls on larger pages
 * (limit=50+ never returned; 25 answers in under a second), and a page that
 * never returns is a view that never finishes loading.
 *
 * ponytail: up to 80 pages per collection, sequential. Fine at view-open cadence;
 * if a profile grows past ~2k records, cache the pages or use a cursor-aware view.
 */
const MAX_PAGES = 80;
const PAGE_SIZE = 25;

const sourceError = (cause: unknown) => new SourceError({ source: "semble", message: String(cause) });

/**
 * A failure mid-walk ends it with what we have, but a failure on the *first*
 * page is not an empty profile — and an empty result here gets cached, which
 * would turn one bad request into five minutes of "No items found".
 */
const listAllRecords = Effect.fn("SembleSource.listAllRecords")(function* (
	repo: string,
	collection: string,
) {
	const records: RawRecord[] = [];
	let cursor: string | undefined;

	for (let page = 0; page < MAX_PAGES; page++) {
		const listed = yield* Repo.listRecords(repo, collection, PAGE_SIZE, cursor).pipe(
			Effect.catchTag("RepoError", (error) =>
				page === 0 ? Effect.fail(error) : Effect.succeed(undefined),
			),
		);
		if (!listed) {
			break;
		}
		records.push(...(listed.records as RawRecord[]));
		cursor = listed.cursor;
		if (!cursor) {
			break;
		}
	}

	return records;
});

const load = Effect.fn("SembleSource.load")(function* (
	repo: string,
	cachePath: string | undefined,
	force: boolean,
) {
	const cached =
		force || !cachePath ? undefined : yield* Cache.read<SembleCache>(cachePath, CACHE_TTL_MS);
	if (cached) {
		return cached;
	}

	const [cards, connections] = yield* Effect.all(
		[
			listAllRecords(repo, "network.cosmik.card"),
			listAllRecords(repo, "network.cosmik.connection"),
		],
		{ concurrency: 2 },
	);
	const fresh: SembleCache = {
		cards: cards as CardRecord[],
		connections: connections as ConnectionRecord[],
	};
	if (cachePath) {
		yield* Cache.write(cachePath, fresh);
	}
	return fresh;
});

const linkToCollection = Effect.fn("SembleSource.linkToCollection")(function* (
	repo: string,
	collectionRkey: string,
	cardUri: string,
	cardCid: string,
	collectionUri: string,
) {
	const { cid } = yield* Repo.getRecord(repo, "network.cosmik.collection", collectionRkey);
	yield* Repo.createRecord(repo, "network.cosmik.collectionLink", {
		$type: "network.cosmik.collectionLink",
		card: { uri: cardUri, cid: cardCid },
		collection: { uri: collectionUri, cid },
		addedAt: new Date().toISOString(),
		addedBy: repo,
		createdAt: new Date().toISOString(),
	});
});

class SembleItem implements ATBookmarkItem {
	private record: CardRecord;
	private attachedNotes: Array<{ uri: string; text: string }>;
	private collections: Array<{ uri: string; name: string; source: string }>;
	private connections: ConnectionInfo[];
	private plugin: ClipperPlugin;

	constructor(record: CardRecord, attachedNotes: Array<{ uri: string; text: string }>, collections: Array<{ uri: string; name: string; source: string }>, connections: ConnectionInfo[], plugin: ClipperPlugin) {
		this.record = record;
		this.attachedNotes = attachedNotes;
		this.collections = collections;
		this.connections = connections;
		this.plugin = plugin;
	}

	getUri(): string {
		return this.record.uri;
	}

	getCid(): string {
		return this.record.cid;
	}

	getCreatedAt(): string {
		return this.record.value.createdAt || new Date().toISOString();
	}

	getSource(): "semble" {
		return "semble";
	}

	canAddNotes(): boolean {
		return true;
	}

	canAddTags(): boolean {
		return false;
	}

	canAddToCollections(): boolean {
		return true;
	}

	canEdit(): boolean {
		return true;
	}


	getTitle(): string | undefined {
		const card = this.record.value;
		if (card.type === "URL") {
			return (card.content as UrlContent).metadata?.title || undefined;
		}
		return undefined;
	}

	getDescription(): string | undefined {
		const card = this.record.value;
		if (card.type === "NOTE") {
			return (card.content as NoteContent).text;
		} else if (card.type === "URL") {
			return (card.content as UrlContent).metadata?.description || undefined;
		}
		return undefined;
	}

	async getImageUrl(): Promise<string | undefined> {
		const card = this.record.value;
		if (card.type === "URL") {
			if ((card.content as UrlContent).metadata?.imageUrl) {
				return (card.content as UrlContent).metadata?.imageUrl;
			}
			return fetchOgImage((card.content as UrlContent).url);
		}
		return undefined;
	}

	getUrl(): string | undefined {
		const card = this.record.value;
		if (card.type === "URL") {
			return (card.content as UrlContent).url;
		}
		return undefined;
	}

	getSiteName(): string | undefined {
		const card = this.record.value;
		if (card.type === "URL") {
			return (card.content as UrlContent).metadata?.siteName || undefined;
		}
		return undefined;
	}

	getTags(): string[] {
		return [];
	}

	getCollections(): Array<{ uri: string; name: string; source: string }> {
		return this.collections;
	}

	setCollections(collections: Array<{ uri: string; name: string; source: string }>) {
		this.collections = collections;
	}

	getAttachedNotes() {
		return this.attachedNotes;
	}

	getConnections(): ConnectionInfo[] {
		return this.connections;
	}

	getRecord() {
		return this.record;
	}
}

export class SembleSource implements DataSource {
	readonly name = "semble" as const;

	constructor(
		private readonly client: ATClient,
		private readonly repo: string,
	) {}

	/** The Promise seam: run an Effect with this source's client. */
	private run = <A, E>(effect: Effect.Effect<A, E, AtClient>): Promise<A> =>
		Effect.runPromise(effect.pipe(Effect.provideService(AtClient, this.client)));

	private cachePath(plugin: ClipperPlugin): string | undefined {
		return plugin.manifest.dir ? `${plugin.manifest.dir}/cache/semble-${this.repo}.json` : undefined;
	}

	/** Every distinct connection endpoint, for the Canvas lens. */
	async fetchConnections(plugin: ClipperPlugin, force = false): Promise<ConnectionInfo[]> {
		const { cards, connections } = await this.run(
			load(this.repo, this.cachePath(plugin), force),
		);
		const seen = new Set<string>();
		const result: ConnectionInfo[] = [];
		for (const list of buildConnectionsMap(cards, connections).values()) {
			for (const info of list) {
				const key = `${info.direction}|${info.type ?? ""}|${info.url ?? ""}|${info.title ?? ""}|${info.note ?? ""}`;
				if (seen.has(key)) {
					continue;
				}
				seen.add(key);
				result.push(info);
			}
		}
		return result;
	}

	async fetchItems(plugin: ClipperPlugin, filteredCollections: Set<string> | undefined, _filteredTags: Set<string>, force = false): Promise<ATBookmarkItem[]> {
		const { cards: allSembleCards, connections: connectionRecords } = await this.run(
			load(this.repo, this.cachePath(plugin), force),
		);
		if (allSembleCards.length === 0) return [];

		const connectionsMap = buildConnectionsMap(allSembleCards, connectionRecords);

		const notesMap = new Map<string, Array<{ uri: string; text: string }>>();
		for (const record of allSembleCards) {
			if (record.value.type === "NOTE") {
				const parentUri = record.value.parentCard?.uri;
				if (parentUri) {
					const noteContent = record.value.content as NoteContent;
					const existing = notesMap.get(parentUri) || [];
					existing.push({ uri: record.uri, text: noteContent.text });
					notesMap.set(parentUri, existing);
				}
			}
		}

		// Filter out NOTE cards that are attached to other cards
		let sembleCards = allSembleCards.filter((record: CardRecord) => {
			if (record.value.type === "NOTE") {
				return !record.value.parentCard?.uri;
			}
			return true;
		});

		if (filteredCollections && filteredCollections.size > 0) {
			sembleCards = sembleCards.filter((card: CardRecord) => filteredCollections.has(card.uri));
		}

		return sembleCards.map((record: CardRecord) =>
			new SembleItem(
				record,
				notesMap.get(record.uri) || [],
				[],
				connectionsFor(connectionsMap, record),
				plugin,
			)
		);
	}

	async getAvailableCollections(): Promise<SourceFilter[]> {
		const collections = await this.run(
			listAllRecords(this.repo, "network.cosmik.collection"),
		);

		return (collections as CollectionRecord[]).map((c) => ({
			value: c.uri,
			label: c.value.name,
			description: c.value.description,
		}));
	}

	async getCollectionAssociations(): Promise<CollectionAssociation[]> {
		const links = await this.run(
			listAllRecords(this.repo, "network.cosmik.collectionLink"),
		);

		return (links as CollectionLinkRecord[]).map((link) => ({
			record: link.value.card.uri,
			collection: link.value.collection.uri,
			linkUri: link.uri,
		}));
	}

	async deleteItem(itemUri: string): Promise<void> {
		const rkey = itemUri.split("/").pop();
		if (!rkey) {
			throw new SourceError({ source: "semble", message: `Invalid uri: ${itemUri}` });
		}
		await this.run(
			Repo.deleteRecord(this.repo, "network.cosmik.card", rkey).pipe(Effect.mapError(sourceError)),
		);
	}

	async addToCollection(itemUri: string, itemCid: string, collectionUri: string): Promise<void> {
		const collectionRkey = collectionUri.split("/").pop();
		if (!collectionRkey) {
			throw new SourceError({ source: "semble", message: `Invalid collection uri: ${collectionUri}` });
		}
		await this.run(
			linkToCollection(this.repo, collectionRkey, itemUri, itemCid, collectionUri).pipe(
				Effect.mapError(sourceError),
			),
		);
	}

	async removeFromCollection(linkUri: string): Promise<void> {
		const rkey = linkUri.split("/").pop();
		if (!rkey) {
			throw new SourceError({ source: "semble", message: `Invalid link uri: ${linkUri}` });
		}
		await this.run(
			Repo.deleteRecord(this.repo, "network.cosmik.collectionLink", rkey).pipe(
				Effect.mapError(sourceError),
			),
		);
	}

}

function cardUrl(card: CardRecord): string | undefined {
	if (card.value.type === "URL") {
		return (card.value.content as UrlContent).url;
	}
	return card.value.url;
}

function cardTitle(card: CardRecord): string | undefined {
	if (card.value.type === "URL") {
		return (card.value.content as UrlContent).metadata?.title;
	}
	return undefined;
}

/**
 * Index connections by endpoint (card AT-URI or raw URL), resolving the *other*
 * endpoint to a URL/title so a clip can render it without another fetch.
 */
function buildConnectionsMap(
	cards: CardRecord[],
	connections: ConnectionRecord[],
): Map<string, ConnectionInfo[]> {
	const byUri = new Map<string, CardRecord>();
	const byUrl = new Map<string, CardRecord>();
	for (const card of cards) {
		byUri.set(card.uri, card);
		const url = cardUrl(card);
		if (url) byUrl.set(url, card);
	}

	const resolve = (endpoint: string): { url?: string; title?: string } => {
		if (endpoint.startsWith("at://")) {
			const card = byUri.get(endpoint);
			return { url: card ? cardUrl(card) : undefined, title: card ? cardTitle(card) : undefined };
		}
		const card = byUrl.get(endpoint);
		return { url: endpoint, title: card ? cardTitle(card) : undefined };
	};

	const map = new Map<string, ConnectionInfo[]>();
	const push = (key: string, info: ConnectionInfo) => {
		const list = map.get(key) ?? [];
		list.push(info);
		map.set(key, list);
	};

	for (const connection of connections) {
		const { source, target, connectionType, note } = connection.value;
		const toTarget = resolve(target);
		const toSource = resolve(source);
		push(source, { type: connectionType, direction: "outgoing", url: toTarget.url, title: toTarget.title, note });
		push(target, { type: connectionType, direction: "incoming", url: toSource.url, title: toSource.title, note });
	}

	return map;
}

function connectionsFor(map: Map<string, ConnectionInfo[]>, card: CardRecord): ConnectionInfo[] {
	const collected = [...(map.get(card.uri) ?? [])];
	const url = cardUrl(card);
	if (url) {
		collected.push(...(map.get(url) ?? []));
	}

	const seen = new Set<string>();
	return collected.filter((info) => {
		const key = `${info.direction}|${info.type ?? ""}|${info.url ?? ""}|${info.note ?? ""}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
