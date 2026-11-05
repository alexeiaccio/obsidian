import { Effect } from "effect";
import Defuddle from "defuddle";
import { htmlToMarkdown, requestUrl } from "obsidian";
import { ReaderError } from "./Errors";

/**
 * Read a page's main content, the way Obsidian Web Clipper does.
 *
 * Fetch with `requestUrl` (no CORS, desktop-only plugin) → parse into a detached
 * `DOMParser` document → Defuddle's dependency-free core bundle → Markdown via
 * Obsidian's own `htmlToMarkdown`, so `defuddle/full` (mathml-to-latex + temml)
 * is not needed.
 *
 * The page itself is not always reachable from the app: a proxy, a host that
 * blocks non-browser clients, or a page that only renders in a browser. So a
 * failed or slow fetch falls back to `defuddle.md`, which fetches the page and
 * returns its Markdown. That fallback hands the URL to a third party — it runs
 * only when the direct read cannot, and it is the only request the plugin makes
 * to a service that is neither the account's repository nor the page itself.
 *
 * Two deliberate choices:
 * - `parse()`, never `parseAsync()`. Async extractors call third-party APIs
 *   (FxTwitter) when a page has no server-rendered content; a community plugin
 *   must not do that behind the user's back.
 * - A detached document has no `defaultView`, so Defuddle's computed-style probes
 *   return `null` and it falls back to scoring. `removeHiddenElements` therefore
 *   cannot see stylesheets — it can only use inline styles. That is a known
 *   limitation of extracting HTML we fetched instead of a live page.
 */

export interface ReaderResult {
	readonly url: string;
	readonly title: string;
	readonly author?: string;
	readonly site?: string;
	readonly description?: string;
	readonly published?: string;
	readonly image?: string;
	readonly wordCount: number;
	readonly markdown: string;
}

/** `defuddle.md` answers with the page's Markdown at `/<page url>`. */
const SERVICE = "https://defuddle.md/";

/** How long a fetch may take before the other path gets its turn. */
const DEADLINE_MS = 8_000;

/**
 * Session cache: a reader pane gets opened, closed and reopened for the same
 * link, and the extraction is the expensive part.
 */
const cache = new Map<string, ReaderResult>();

/** A request that never answers is a pane that never loads. */
/** `requestUrl` rejects with errors whose message is sometimes empty. */
const reasonOf = (cause: unknown): string => {
	if (cause instanceof Error) {
		return cause.message.length > 0 ? cause.message : cause.name;
	}
	return String(cause);
};

const withDeadline = async <A>(run: () => Promise<A>): Promise<A> => {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_, reject) => {
		timer = setTimeout(
			() => reject(new Error(`no answer in ${DEADLINE_MS}ms`)),
			DEADLINE_MS,
		);
	});
	try {
		return await Promise.race([run(), deadline]);
	} finally {
		clearTimeout(timer);
	}
};

/** The fetch-and-parse path: the page as the site serves it. */
const readDirect = (url: string): Effect.Effect<ReaderResult, ReaderError> =>
	Effect.gen(function* () {
		const response = yield* Effect.tryPromise({
			try: () => withDeadline(() => requestUrl({ url })),
			catch: (cause) => new ReaderError({ url, message: `fetch failed: ${reasonOf(cause)}` }),
		});
		if (response.status >= 400) {
			return yield* new ReaderError({ url, message: `HTTP ${response.status}` });
		}

		const parsed = yield* Effect.try({
			try: () => {
				const doc = new DOMParser().parseFromString(response.text, "text/html");
				return new Defuddle(doc, { url }).parse();
			},
			catch: (cause) => new ReaderError({ url, message: `parse failed: ${String(cause)}` }),
		});

		if (parsed.wordCount === 0) {
			return yield* new ReaderError({ url, message: "no readable content found" });
		}

		return {
			url,
			title: parsed.title || url,
			author: parsed.author || undefined,
			site: parsed.site || undefined,
			description: parsed.description || undefined,
			published: parsed.published || undefined,
			image: parsed.image || undefined,
			wordCount: parsed.wordCount,
			// Defuddle's own Markdown exists only in its `full`/`node` bundles; the core
			// bundle leaves it undefined, so Obsidian's converter is the real path.
			markdown: parsed.contentMarkdown ?? htmlToMarkdown(parsed.content),
		};
	});

/** A service page: a YAML header of flat scalars, then the Markdown body. */
const splitServicePage = (text: string): {
	readonly fields: Record<string, string>;
	readonly body: string;
} => {
	if (!text.startsWith("---")) {
		return { fields: {}, body: text.trim() };
	}
	const end = text.indexOf("\n---", 3);
	if (end === -1) {
		return { fields: {}, body: text.trim() };
	}

	const fields: Record<string, string> = {};
	for (const line of text.slice(3, end).split("\n")) {
		const at = line.indexOf(":");
		if (at === -1) {
			continue;
		}
		const key = line.slice(0, at).trim();
		const raw = line.slice(at + 1).trim();
		const value = raw.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
		if (key.length > 0 && value.length > 0) {
			fields[key] = value;
		}
	}
	return { fields, body: text.slice(end + 4).trim() };
};

/** The fallback path: someone else's browser fetches the page for us. */
const readViaService = (url: string): Effect.Effect<ReaderResult, ReaderError> =>
	Effect.gen(function* () {
		const response = yield* Effect.tryPromise({
			try: () => withDeadline(() => requestUrl({ url: `${SERVICE}${url}` })),
			catch: (cause) =>
				new ReaderError({ url, message: `defuddle.md failed: ${reasonOf(cause)}` }),
		});
		if (response.status >= 400) {
			return yield* new ReaderError({
				url,
				message: `defuddle.md answered HTTP ${response.status}`,
			});
		}

		const { fields, body } = splitServicePage(response.text);
		if (body.length === 0) {
			return yield* new ReaderError({ url, message: "defuddle.md returned no content" });
		}

		const counted = Number(fields["word_count"] ?? "");
		return {
			url,
			title: fields["title"] ?? url,
			author: fields["author"] ?? undefined,
			site: fields["site"] ?? fields["domain"] ?? undefined,
			description: fields["description"] ?? undefined,
			published: fields["published"] ?? undefined,
			image: fields["image"] ?? undefined,
			wordCount: Number.isFinite(counted) && counted > 0 ? counted : body.split(/\s+/u).length,
			markdown: body,
		};
	});

/** Extract the readable content of `url`, converting it to Markdown. */
export const read = Effect.fn("Reader.read")(function* (url: string) {
	const cached = cache.get(url);
	if (cached) {
		return cached;
	}

	const direct = yield* Effect.result(readDirect(url));
	if (direct._tag === "Success") {
		cache.set(url, direct.success);
		return direct.success;
	}

	const viaService = yield* Effect.result(readViaService(url));
	if (viaService._tag === "Success") {
		cache.set(url, viaService.success);
		return viaService.success;
	}

	return yield* new ReaderError({
		url,
		message: `${direct.failure.message}; defuddle.md: ${viaService.failure.message}`,
	});
});
