import { Effect } from "effect";
import type { Main as MarginNoteValue } from "../lexicons/types/at/margin/note";
import { sameUrl } from "../lib/url";
import { AtClient } from "./AtClient";
import * as Repo from "./Repo";

/**
 * margin.at notes.
 *
 * margin replaced `at.margin.highlight`, `at.margin.annotation` and `at.margin.bookmark`
 * with one W3C-shaped `at.margin.note` (published revision 4; the plugin vendors the schema
 * at `lexicons/at/margin/note.json`). Highlights, comments and bookmarks are now the same
 * record, distinguished by `motivation`, with the selected text in `target.selector.exact`,
 * the note in `body.value` and the tint in `color`.
 *
 * The plugin's *generated* lexicons predate that change, so this module carries the
 * published shape itself and also reads the legacy `at.margin.highlight` records, so
 * nothing saved before the change is lost.
 */

export const NOTE_COLLECTION = "at.margin.note";
const LEGACY_HIGHLIGHT_COLLECTION = "at.margin.highlight";

/**
 * What this plugin *reads*: `at.margin.note` and the legacy `at.margin.highlight` records
 * that margin no longer writes. The lenient shape covers both.
 *
 * What it *writes* is typed as the generated `at.margin.note` schema
 * (`lexicons/types/at/margin/note.ts`), so a schema change fails the build rather than
 * silently producing a record margin ignores.
 */
export interface MarginNote {
	readonly $type?: string;
	readonly createdAt: string;
	readonly motivation: string;
	readonly color?: string;
	readonly body?: { readonly format?: string; readonly value?: string };
	readonly target: {
		readonly source: string;
		readonly title?: string;
		/**
		 * W3C selector. Discriminated by `type`, which the lexicon is explicit is *not* an
		 * atproto `$type` — sending `$type` here is what the old records did and is wrong.
		 */
		readonly selector?: { readonly type?: string; readonly exact?: string };
	};
	readonly generator?: { readonly id?: string; readonly name?: string; readonly homepage?: string };
	readonly tags?: readonly string[];
}

export interface MarginNoteRecord {
	readonly uri: string;
	readonly cid: string;
	readonly value: MarginNote;
}

/** Identifies this client in the records it writes. */
const GENERATOR = {
	name: "Obsidian Clipper",
	homepage: "https://github.com/alexeiaccio/obsidian",
} as const;

export type Motivation = "highlighting" | "commenting" | "bookmarking";

export interface SaveNoteParams {
	readonly url: string;
	readonly motivation: Motivation;
	/** Page title at the time of annotation. */
	readonly title?: string;
	/** The selected text, for a highlight or a comment on one. */
	readonly exact?: string;
	/** The annotation text. */
	readonly note?: string;
	readonly color?: string;
	readonly tags?: readonly string[];
}

/** Build the record this client writes for a highlight, a comment or a bookmark. */
export const noteRecord = (params: SaveNoteParams): MarginNoteValue => ({
	$type: NOTE_COLLECTION,
	// `datetimeString()` types as a template literal; an ISO string is exactly that shape.
	createdAt: new Date().toISOString() as MarginNoteValue["createdAt"],
	motivation: params.motivation,
	generator: GENERATOR,
	target: {
		// `genericUriString()` types as `${string}:${string}`; the caller has a URL.
		source: params.url as MarginNoteValue["target"]["source"],
		...(params.title === undefined || params.title.length === 0
			? {}
			: { title: params.title.slice(0, 500) }),
		...(params.exact === undefined || params.exact.length === 0
			? {}
			: { selector: { type: "TextQuoteSelector", exact: params.exact } }),
	},
	...(params.note === undefined || params.note.length === 0
		? {}
		: { body: { format: "text/plain", value: params.note } }),
	...(params.color === undefined ? {} : { color: params.color }),
	...(params.tags === undefined || params.tags.length === 0 ? {} : { tags: [...params.tags] }),
});

/** Save a highlight, a comment or a bookmark to the user's repo. */
export const save = Effect.fn("Highlights.save")(function* (repo: string, params: SaveNoteParams) {
	yield* Repo.createRecord(repo, NOTE_COLLECTION, noteRecord(params));
	// The cached lists are stale now, so the next clip sees what was just saved.
	notes.clear();
	legacyHighlights.clear();
});

// ------------------------------------------------------------------------------ reading

export interface HighlightItem {
	/** The highlighted text. */
	readonly text: string;
	/** The annotation written against it, if any. */
	readonly note?: string;
	readonly color?: string;
	readonly tags: readonly string[];
	readonly createdAt: string;
	readonly uri: string;
}

/** Both collections, because a note saved before the change is still a highlight. */
const notes = new Map<string, readonly MarginNoteRecord[]>();
const legacyHighlights = new Map<string, readonly MarginNoteRecord[]>();

const load = (
	repo: string,
	collection: string,
	cache: Map<string, readonly MarginNoteRecord[]>,
): Effect.Effect<readonly MarginNoteRecord[], never, AtClient> => {
	const cached = cache.get(repo);
	if (cached) {
		return Effect.succeed(cached);
	}
	return Effect.map(Repo.listRecords(repo, collection), (page) => {
		const records = page.records as MarginNoteRecord[];
		cache.set(repo, records);
		return records;
	}).pipe(Effect.orElseSucceed((): readonly MarginNoteRecord[] => []));
};

const toItem = (record: MarginNoteRecord): HighlightItem | undefined => {
	const text = record.value.target?.selector?.exact;
	if (typeof text !== "string" || text.length === 0) {
		return undefined;
	}
	const note = record.value.body?.value;
	return {
		text,
		...(note === undefined || note.length === 0 ? {} : { note }),
		...(record.value.color === undefined ? {} : { color: record.value.color }),
		tags: record.value.tags ?? [],
		createdAt: record.value.createdAt ?? "",
		uri: record.uri,
	};
};

/** The highlights and comments recorded against `url`, newest first. */
export const forUrl = Effect.fn("Highlights.forUrl")(function* (repo: string, url: string) {
	const [current, legacy] = yield* Effect.all(
		[load(repo, NOTE_COLLECTION, notes), load(repo, LEGACY_HIGHLIGHT_COLLECTION, legacyHighlights)],
		{ concurrency: 2 },
	);

	const items: HighlightItem[] = [];
	for (const record of [...current, ...legacy]) {
		// Normalised, so a highlight saved against the same page with a fragment or a
		// tracking parameter still matches.
		if (!sameUrl(record.value.target?.source, url)) {
			continue;
		}
		const item = toItem(record);
		if (item) {
			items.push(item);
		}
	}
	return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
});
