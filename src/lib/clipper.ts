import { Effect } from "effect";
import type { ResolvedActor } from "../effect/Identity";
import type { Document, Publication } from "./standardsite/schemas";
import { is, parseResourceUri } from "@atcute/lexicons";
import { PubLeafletContent } from "@atcute/leaflet";
import { BlogPcktContent } from "@atcute/pckt";
import { TFile, parseYaml } from "obsidian";
import { ATRecord, buildDocumentUrl } from "lib";
import type ClipperPlugin from "main";
import { AtClient, getActor } from "../effect/AtClient";
import { VaultError } from "../effect/Errors";
import { forUrl as highlightsForUrl, type HighlightItem } from "../effect/Highlights";
import { notify } from "../effect/Notice";
import { read, type ReaderResult } from "../effect/Reader";
import {
	DEFAULT_TEMPLATE,
	PAGE_VARIABLES,
	renderTemplate,
	splitFrontmatter,
	substituteDeep,
	usedVariables,
	type TemplateVariables,
} from "../effect/Template";
import { Vault } from "../effect/Vault";
import { applyRelationLens, renderRelations, type RelationLens } from "../lens/relations";
import { normalizeUrl } from "../lib/url";
import type { ATBookmarkItem, ConnectionInfo } from "../sources/types";
import { leafletContentToMarkdown } from "./markdown/leaflet";
import { pcktContentToMarkdown } from "./markdown/pckt";

/**
 * Clipping runs as Effects over the `Vault` service, with the class below as the
 * Promise seam the vendored UI calls.
 */

const bskyLink = (handle: string) => `https://bsky.app/profile/${handle}`;

const safeFilePath = (title: string, clipDir: string) => {
	const safeTitle = title.replace(/[/\\?%*:|"<>]/g, "-").substring(0, 50);
	return `${clipDir}/${safeTitle}.md`;
};

const writeDocumentFrontmatter = (
	plugin: ClipperPlugin,
	file: TFile,
	doc: ATRecord<Document>,
	pub: ATRecord<Publication>,
) =>
	Effect.gen(function* () {
		const vault = yield* Vault;

		let actor: ResolvedActor | undefined;
		const repoParsed = parseResourceUri(doc.uri);
		if (repoParsed !== undefined) {
			// An unresolved author costs the frontmatter field, not the clip.
			actor = yield* getActor(repoParsed.repo).pipe(
				Effect.orElseSucceed((): undefined => undefined),
			);
		}

		yield* vault.frontmatter(file, (fm) => {
			fm["title"] = doc.value.title;
			if (actor && actor.handle) {
				fm["author"] = `[${actor.handle}](${bskyLink(actor.handle)})`;
			}

			// pubUrl is at:// record uri or https:// for loose document
			// fetch pub if at:// so we can get the url
			// otherwise just use the url as is
			const docUrl = doc.value.site.startsWith("https://")
				? buildDocumentUrl(doc.value.site, doc.uri, doc.value)
				: buildDocumentUrl(pub.value.url, doc.uri, doc.value);
			if (docUrl) {
				fm["url"] = docUrl;
			}
		});
	});

const hostnameOf = (url: string | undefined): string | undefined => {
	if (!url) {
		return undefined;
	}
	try {
		return new URL(url).hostname;
	} catch {
		return undefined;
	}
};

const renderNotes = (item: ATBookmarkItem): string => {
	const notes = item.getAttachedNotes?.() ?? [];
	return notes.map((note) => `- ${note.text}`).join("\n");
};

/** `{{highlights}}`: the margin notes recorded against this URL, with their annotations. */
const renderHighlights = (highlights: readonly HighlightItem[]): string => {
	if (highlights.length === 0) {
		return "";
	}
	const lines = ["## Highlights", ""];
	for (const highlight of highlights) {
		lines.push(`> ${highlight.text}`);
		if (highlight.note) {
			lines.push(">", `> ${highlight.note}`);
		}
		if (highlight.tags.length > 0) {
			lines.push(">", `> ${highlight.tags.map((tag) => `#${tag}`).join(" ")}`);
		}
		lines.push("");
	}
	return lines.join("\n");
};

/** The variables a template can use: the item's own fields, plus the page's when fetched. */
const itemVariables = (
	item: ATBookmarkItem,
	title: string,
	page: ReaderResult | undefined,
	highlights: string,
	relationVariables: TemplateVariables,
): TemplateVariables => ({
	title,
	url: item.getUrl(),
	description: item.getDescription(),
	source: item.getSource(),
	site: page?.site ?? item.getSiteName(),
	author: page?.author,
	published: page?.published,
	image: page?.image,
	domain: hostnameOf(page?.url),
	words: page ? String(page.wordCount) : undefined,
	content: page?.markdown,
	tags: item.getTags().join(", "),
	collections: (item.getCollections?.() ?? []).map((collection) => collection.name).join(", "),
	created: item.getCreatedAt(),
	uri: item.getUri(),
	cid: item.getCid(),
	notes: renderNotes(item),
	...relationVariables,
	highlights,
});

/** The relation lens the settings describe. */
const relationLensFor = (plugin: ClipperPlugin): RelationLens => {
	const settings = plugin.settings.relations;
	const lens: {
		direction?: "incoming" | "outgoing";
		types?: readonly string[];
		resolvedOnly?: boolean;
		limit?: number;
	} = {};

	if (settings?.directions === "incoming" || settings?.directions === "outgoing") {
		lens.direction = settings.directions;
	}

	const types = (settings?.types ?? "")
		.split(",")
		.map((type) => type.trim())
		.filter((type) => type.length > 0);
	if (types.length > 0) {
		lens.types = types;
	}

	if (settings?.resolvedOnly === true) {
		lens.resolvedOnly = true;
	}
	if (typeof settings?.limit === "number" && settings.limit > 0) {
		lens.limit = settings.limit;
	}

	return lens;
};

/**
 * normalised url -> linktext for the clips already in the vault. Only the clip directory is
 * scanned, and only until every relation URL has been found.
 */
const clippedNotesByUrl = (plugin: ClipperPlugin, urls: ReadonlySet<string>): Map<string, string> => {
	const index = new Map<string, string>();
	if (urls.size === 0) {
		return index;
	}
	const { app } = plugin;
	const clipDir = plugin.settings.clipDir;
	for (const file of app.vault.getMarkdownFiles()) {
		if (index.size >= urls.size) {
			break;
		}
		if (!file.path.startsWith(clipDir)) {
			continue;
		}
		const url = app.metadataCache.getFileCache(file)?.frontmatter?.["url"];
		if (typeof url !== "string") {
			continue;
		}
		const key = normalizeUrl(url);
		if (urls.has(key) && !index.has(key)) {
			index.set(key, app.metadataCache.fileToLinktext(file, "", false));
		}
	}
	return index;
};

/** A relation whose other endpoint has been clipped links to that note, not its URL. */
const relationNoteLookup = (
	plugin: ClipperPlugin,
	relations: readonly ConnectionInfo[],
): ((relation: ConnectionInfo) => string | undefined) | undefined => {
	if (plugin.settings.relations?.linkClippedNotes === false) {
		return undefined;
	}
	const urls = new Set(
		relations
			.map((relation) => relation.url)
			.filter((url): url is string => typeof url === "string" && url.length > 0)
			.map(normalizeUrl),
	);
	const index = clippedNotesByUrl(plugin, urls);
	return index.size === 0
		? undefined
		: (relation) =>
				relation.url !== undefined ? index.get(normalizeUrl(relation.url)) : undefined;
};

/**
 * The relation variables, in and out: `{{connections}}` is both directions, and the
 * in/out variants are the same relations seen from one side.
 */
const relationVariables = (
	plugin: ClipperPlugin,
	relations: readonly ConnectionInfo[],
): TemplateVariables => {
	const lens = relationLensFor(plugin);
	const noteFor = relationNoteLookup(plugin, relations);

	return {
		connections: renderRelations(applyRelationLens(relations, lens), { noteFor }),
		connectionsIn: renderRelations(
			applyRelationLens(relations, { ...lens, direction: "incoming" }),
			{ heading: "Incoming", noteFor },
		),
		connectionsOut: renderRelations(
			applyRelationLens(relations, { ...lens, direction: "outgoing" }),
			{ heading: "Outgoing", noteFor },
		),
	};
};

/** Template selection: the source's own template, else the general one, else the default. */
const templateFor = (plugin: ClipperPlugin, item: ATBookmarkItem): string =>
	plugin.settings.templates?.[item.getSource()]?.trim()
	|| plugin.settings.template?.trim()
	|| DEFAULT_TEMPLATE;

/** Broken or non-mapping YAML costs the properties, not the clip. */
const parseProperties = (
	yaml: string,
	variables: TemplateVariables,
): Record<string, unknown> | undefined => {
	try {
		const parsed = substituteDeep(parseYaml(yaml), variables);
		return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: undefined;
	} catch {
		return undefined;
	}
};

/** The frontmatter a clip gets when its template defines none. */
const itemDefaults = (item: ATBookmarkItem): Record<string, unknown> => {
	const defaults: Record<string, unknown> = {};

	const title = item.getTitle();
	if (title) defaults["title"] = title;

	const url = item.getUrl();
	if (url) defaults["url"] = url;

	defaults["source"] = item.getSource();

	const description = item.getDescription();
	if (description) defaults["description"] = description;

	const siteName = item.getSiteName();
	if (siteName) defaults["site"] = siteName;

	const tags = item.getTags();
	if (tags.length > 0) defaults["tags"] = tags;

	const collections = item.getCollections?.() ?? [];
	if (collections.length > 0) defaults["collections"] = collections.map((collection) => collection.name);

	const createdAt = item.getCreatedAt();
	if (createdAt) defaults["createdAt"] = createdAt;

	const uri = item.getUri();
	if (uri.startsWith("at://")) defaults["at-uri"] = uri;

	return defaults;
};

/**
 * Render the note from the template that applies to this item.
 *
 * A template that references page variables (`{{content}}`, `{{author}}`, …) makes
 * this fetch and extract the page; a plain template stays offline. An extraction
 * that fails costs those variables, not the clip.
 */
const renderItem = (plugin: ClipperPlugin, item: ATBookmarkItem, title: string) =>
	Effect.gen(function* () {
		const { yaml, body } = splitFrontmatter(templateFor(plugin, item));
		const url = item.getUrl();
		const names = usedVariables(`${yaml ?? ""}\n${body}`);
		const needsPage = names.some((name) => PAGE_VARIABLES.has(name));

		const page =
			needsPage && url
				? yield* read(url).pipe(Effect.orElseSucceed((): ReaderResult | undefined => undefined))
				: undefined;

		// `{{highlights}}` reads the user's own margin.at records rather than the page.
		const repo = plugin.settings.did;
		const highlights =
			names.includes("highlights") && repo && url
				? yield* highlightsForUrl(repo, url).pipe(
						Effect.orElseSucceed((): HighlightItem[] => []),
					)
				: [];

		const variables = itemVariables(
			item,
			title,
			page,
			renderHighlights(highlights),
			relationVariables(plugin, item.getConnections?.() ?? []),
		);
		return {
			body: renderTemplate(body, variables),
			properties: yaml ? parseProperties(yaml, variables) : undefined,
		};
	});

const writeItemFrontmatter = (
	file: TFile,
	item: ATBookmarkItem,
	properties: Record<string, unknown> | undefined,
) =>
	Effect.gen(function* () {
		const vault = yield* Vault;
		yield* vault.frontmatter(file, (fm) => {
			// Defaults first: a template's own properties win, and the plugin's keys
			// (at-uri) survive unless the template overrides them.
			Object.assign(fm, itemDefaults(item), properties ?? {});
		});
	});

const clipDocument = Effect.fn("Clipper.clipDocument")(function* (
	plugin: ClipperPlugin,
	doc: ATRecord<Document>,
	pub: ATRecord<Publication>,
) {
	const vault = yield* Vault;
	const clipDir = plugin.settings.clipDir;

	const parsed = parseResourceUri(pub.uri);
	if (parsed === undefined) {
		return yield* new VaultError({ path: pub.uri, message: `Invalid publication URI: ${pub.uri}` });
	}

	yield* vault.ensureFolder(clipDir);
	const filePath = safeFilePath(doc.value.title, clipDir);

	const existingFile = vault.file(filePath);
	if (existingFile) {
		yield* vault.open(existingFile);
		yield* notify(`Opened existing clipped document: ${filePath}`);
		return;
	}

	let content = `# ${doc.value.title}\n\n`;

	if (doc.value.description) {
		content += `> ${doc.value.description}\n\n`;
	}

	content += `---\n\n`;

	let bodyContent = "";
	if (doc.value.content) {
		if (is(PubLeafletContent.mainSchema, doc.value.content)) {
			bodyContent = leafletContentToMarkdown(doc.value.content);
		} else if (is(BlogPcktContent.mainSchema, doc.value.content)) {
			bodyContent = pcktContentToMarkdown(doc.value.content);
		}
	}

	if (!bodyContent && doc.value.textContent) {
		bodyContent = doc.value.textContent;
	}

	content += bodyContent;

	const file = yield* vault.create(filePath, content);
	yield* writeDocumentFrontmatter(plugin, file, doc, pub);
	yield* vault.open(file);

	yield* notify(`Clipped document to ${filePath}`);
});

/**
 * Clip any bookmark item (from any source) to a markdown note.
 *
 * Each source gets its own subfolder under the clip directory, and the note
 * frontmatter carries the fields the source actually has — so an Arc tab and a
 * GitHub star land with the same shape but their own metadata.
 */
const clipItem = Effect.fn("Clipper.clipItem")(function* (
	plugin: ClipperPlugin,
	item: ATBookmarkItem,
) {
	const vault = yield* Vault;
	const clipDir = plugin.settings.clipDir;
	const sourceDir = `${clipDir}/${item.getSource()}`;

	yield* vault.ensureFolder(clipDir);
	yield* vault.ensureFolder(sourceDir);

	const title = item.getTitle() || item.getUrl() || item.getUri();
	const filePath = safeFilePath(title, sourceDir);

	const existing = vault.file(filePath);
	if (existing) {
		yield* vault.open(existing);
		yield* notify(`Opened existing clip: ${filePath}`);
		return existing;
	}

	const rendered = yield* renderItem(plugin, item, title);
	const file = yield* vault.create(filePath, rendered.body);
	yield* writeItemFrontmatter(file, item, rendered.properties);
	yield* vault.open(file);

	yield* notify(`Clipped to ${filePath}`);
	return file;
});

/** Variables for a clip made from a page rather than a bookmark record. */
const pageVariables = (
	page: ReaderResult,
	selection: string | undefined,
	note: string | undefined,
): TemplateVariables => ({
	title: page.title,
	url: page.url,
	description: page.description,
	source: "page",
	site: page.site,
	author: page.author,
	published: page.published,
	image: page.image,
	domain: hostnameOf(page.url),
	words: String(page.wordCount),
	content: page.markdown,
	selection,
	note,
});

const pageDefaults = (page: ReaderResult): Record<string, unknown> => {
	const defaults: Record<string, unknown> = { title: page.title, url: page.url, source: "page" };
	if (page.author) defaults["author"] = page.author;
	if (page.site) defaults["site"] = page.site;
	if (page.published) defaults["published"] = page.published;
	return defaults;
};

/**
 * Clip a page from the reader — the record-less counterpart of `clipItem`.
 *
 * With a `selection` the quoted text goes into the note (and into `{{selection}}`).
 * An existing page clip is opened and the selection appended, so highlighting from
 * the reader is additive rather than destructive.
 */
const clipPage = Effect.fn("Clipper.clipPage")(function* (
	plugin: ClipperPlugin,
	page: ReaderResult,
	selection: string | undefined,
	note: string | undefined,
) {
	const vault = yield* Vault;
	const clipDir = plugin.settings.clipDir;
	const pageDir = `${clipDir}/pages`;
	yield* vault.ensureFolder(clipDir);
	yield* vault.ensureFolder(pageDir);

	const filePath = safeFilePath(page.title || page.url, pageDir);
	const existing = vault.file(filePath);

	const quoted = selection !== undefined && selection.length > 0 ? `> ${selection}` : undefined;
	const written = note !== undefined && note.length > 0 ? note : undefined;
	// What the template did not consume is appended, so a selection or note is never
	// silently dropped by a template that does not mention it.
	const leftovers = (consumed: readonly string[]) =>
		[
			quoted !== undefined && !consumed.includes("selection") ? quoted : undefined,
			written !== undefined && !consumed.includes("note") ? written : undefined,
		]
			.filter((part): part is string => part !== undefined)
			.join("\n\n");

	if (existing) {
		yield* vault.open(existing);
		const rest = leftovers(["selection", "note"]);
		if (rest.length > 0) {
			yield* vault.append(existing, `\n\n${rest}\n`);
			yield* notify(`Added to ${filePath}`);
		} else {
			yield* notify(`Opened existing page clip: ${filePath}`);
		}
		return existing;
	}

	const { yaml, body } = splitFrontmatter(plugin.settings.template?.trim() || DEFAULT_TEMPLATE);
	const variables = pageVariables(page, selection, note);
	const properties = yaml ? parseProperties(yaml, variables) : undefined;

	const file = yield* vault.create(filePath, renderTemplate(body, variables));
	yield* vault.frontmatter(file, (fm) => {
		Object.assign(fm, pageDefaults(page), properties ?? {});
	});

	const rest = leftovers(usedVariables(body));
	if (rest.length > 0) {
		yield* vault.append(file, `\n\n${rest}\n`);
	}

	yield* vault.open(file);

	yield* notify(`Clipped page to ${filePath}`);
	return file;
});

export class Clipper {
	plugin: ClipperPlugin;

	constructor(plugin: ClipperPlugin) {
		this.plugin = plugin;
	}

	/** The Promise seam: run an Effect with this plugin's client and vault. */
	private run = <A, E>(effect: Effect.Effect<A, E, AtClient | Vault>): Promise<A> =>
		Effect.runPromise(
			effect.pipe(
				Effect.provideService(AtClient, this.plugin.client),
				Effect.provide(Vault.layer(this.plugin.app)),
			),
		);

	safeFilePath(title: string, clipDir: string) {
		return safeFilePath(title, clipDir);
	}

	existsInClipDir(doc: ATRecord<Document>) {
		const clipDir = this.plugin.settings.clipDir;
		const filePath = safeFilePath(doc.value.title, clipDir);
		return this.plugin.app.vault.getAbstractFileByPath(filePath) !== null;
	}

	async writeFrontmatter(file: TFile, doc: ATRecord<Document>, pub: ATRecord<Publication>) {
		await this.run(writeDocumentFrontmatter(this.plugin, file, doc, pub));
	}

	async clipDocument(doc: ATRecord<Document>, pub: ATRecord<Publication>) {
		await this.run(clipDocument(this.plugin, doc, pub));
	}

	async clipItem(item: ATBookmarkItem): Promise<TFile> {
		return this.run(clipItem(this.plugin, item));
	}

	/** Clip a page read in the reader pane; `selection` and `note` are appended. */
	async clipPage(page: ReaderResult, selection?: string, note?: string): Promise<TFile> {
		return this.run(clipPage(this.plugin, page, selection, note));
	}
}
