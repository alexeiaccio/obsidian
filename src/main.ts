import { Context, Effect, Layer, Scope } from "effect";
import { Notice, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, AtProtoSettings, AtProtoSettingsSchema, makeSettingTab } from "./settings";
import { layer as settingsLayer, type SettingsService } from "./effect/Settings";
import { BookmarksView, VIEW_TYPE_CLIPPER_BOOKMARKS } from "./views/bookmarks";
import { ReaderView, VIEW_TYPE_CLIPPER_READER, openReader, sourceUrlOf } from "./views/reader";
import { publishFileAsDocument } from "./commands/publishDocument";
import { StandardFeedView, VIEW_CLIPPER_STANDARD_FEED } from "views/standardfeed";
import { ATClient } from "lib/client";
import { Clipper } from "lib/clipper";
import { registerIcons } from "./icons";
import { BskyEmbedProcessor } from "./postprocessor";
import { EffectPlugin, Plugin, addCommand, addCommandEditor } from "./effect/Plugin";
import { AtClient, restoreSession } from "./effect/AtClient";
import type { OAuthStorage } from "./effect/OAuth";
import { notify } from "./effect/Notice";
import { Vault } from "./effect/Vault";
import { connectionsCommand } from "./lens/connections";
import { topicGroupsCommand, type TopicItem } from "./lens/topics";
import { mapQueueCommand, type MapRef } from "./lens/mapqueue";
import { SembleSource } from "./sources/semble";
import type { ATBookmarkItem, ConnectionInfo } from "./sources/types";

/** Cap on candidate topics fed to Jev — too many options weakens each question. */
const MAX_TOPICS = 24;

export default class ClipperPlugin extends EffectPlugin {
	private settingsService?: SettingsService<AtProtoSettings>;
	client: ATClient;
	clipper: Clipper;

	get settings(): AtProtoSettings {
		return this.settingsService?.unsafeGet() ?? DEFAULT_SETTINGS;
	}

	updateSettings(f: (current: AtProtoSettings) => AtProtoSettings): void {
		this.settingsService?.unsafeUpdate(f);
	}

	protected run(): Effect.Effect<void, never, Plugin | Scope.Scope> {
		const plugin = this;

		return Effect.gen(function*() {
			registerIcons();

			const settings = settingsLayer(AtProtoSettingsSchema, DEFAULT_SETTINGS, makeSettingTab);
			const context = yield* Layer.build(settings.layer);
			plugin.settingsService = Context.get(context, settings.tag);

			// the plugin's own per-vault storage: the DPoP key and the sessions live there
			const oauthStorage: OAuthStorage = {
				load: (key) => plugin.app.loadLocalStorage(key) as string | null,
				save: (key, value) => plugin.app.saveLocalStorage(key, value),
			};
			plugin.client = new ATClient(oauthStorage);
			plugin.clipper = new Clipper(plugin);

			const bskyProcessor = new BskyEmbedProcessor();
			plugin.registerMarkdownPostProcessor((el, ctx) => {
				void bskyProcessor.process(el, ctx);
			});

			plugin.registerView(VIEW_TYPE_CLIPPER_BOOKMARKS, (leaf) => {
				return new BookmarksView(leaf, plugin);
			});

			plugin.registerView(VIEW_CLIPPER_STANDARD_FEED, (leaf) => {
				return new StandardFeedView(leaf, plugin);
			});

			plugin.registerView(VIEW_TYPE_CLIPPER_READER, (leaf) => {
				return new ReaderView(leaf, plugin);
			});

			plugin.addRibbonIcon("layers", "Clipper bookmarks", () => {
				void plugin.activateView(VIEW_TYPE_CLIPPER_BOOKMARKS);
			});

			plugin.addRibbonIcon("rss", "Clipper feed", () => {
				void plugin.activateView(VIEW_CLIPPER_STANDARD_FEED);
			});

			yield* addCommand({
				id: "open-bookmarks",
				name: "Open bookmarks",
				run: Effect.promise(() => plugin.activateView(VIEW_TYPE_CLIPPER_BOOKMARKS)),
			});
			yield* addCommand({
				id: "open-feed",
				name: "Open feed",
				run: Effect.promise(() => plugin.activateView(VIEW_CLIPPER_STANDARD_FEED)),
			});

			yield* addCommandEditor({
				id: "publish-note",
				name: "Publish note",
				check: Effect.sync(() => plugin.app.workspace.getActiveFile() !== null),
				run: Effect.promise(() => publishFileAsDocument(plugin)),
			});

			yield* addCommand({
				id: "read-source",
				name: "Read source of this note",
				check: Effect.sync(() => sourceUrlOf(plugin) !== undefined),
				run: Effect.gen(function* () {
					const url = sourceUrlOf(plugin);
					if (!url) {
						yield* notify("This note has no `url` in its frontmatter.");
						return;
					}
					yield* Effect.promise(() => openReader(plugin, url));
				}),
			});

			yield* connectionsCommand(() => plugin.getConnections());

			yield* topicGroupsCommand({
				getItems: () => plugin.topicItems(),
				getTopics: () => plugin.topicCandidates(),
				getApiKey: () => plugin.settings.typesafeApiKey,
			});

			yield* mapQueueCommand({
				getRefs: () => plugin.mapRefs(),
				getMapFile: () => plugin.settings.mapFile,
			});
		}).pipe(Effect.provide(Vault.layer(plugin.app)));
	}

	/** Saved links as a queue for the map (agent-rendered). Empty when logged out. */
	async mapRefs(): Promise<MapRef[]> {
		const items = await this.bookmarkItems();
		const refs: MapRef[] = [];
		for (const item of items) {
			const url = item.getUrl();
			if (!url) {
				continue;
			}
			refs.push({
				url,
				title: item.getTitle(),
				source: item.getSource(),
				tags: item.getTags(),
			});
		}
		return refs;
	}

	/** Semble connection endpoints, for the Canvas lens. Empty when logged out. */
	async getConnections(): Promise<ConnectionInfo[]> {
		const did = this.settings.did;
		if (!did) {
			return [];
		}
		return new SembleSource(this.client, did).fetchConnections(this);
	}

	/** Saved links as Jev topic inputs. Empty when logged out. */
	async topicItems(): Promise<TopicItem[]> {
		const items = await this.bookmarkItems();
		return items.map((item) => ({
			id: item.getUri(),
			title: item.getTitle(),
			description: item.getDescription(),
			url: item.getUrl(),
			site: item.getSiteName(),
			tags: item.getTags(),
		}));
	}

	/**
	 * Candidate topics for grouping: an explicit list from settings, plus the
	 * user's collections, tags, and sites that recur (a site seen once is a link,
	 * not a topic).
	 */
	async topicCandidates(): Promise<string[]> {
		const candidates = new Set<string>(
			(this.settings.topics ?? "")
				.split(",")
				.map((topic) => topic.trim())
				.filter((topic) => topic.length > 0),
		);

		const did = this.settings.did;
		if (did) {
			const source = new SembleSource(this.client, did);
			const collections = await (source.getAvailableCollections?.() ?? Promise.resolve([]));
			for (const collection of collections) {
				candidates.add(collection.label ?? collection.value);
			}
		}

		const items = await this.bookmarkItems();
		for (const item of items) {
			for (const tag of item.getTags()) {
				candidates.add(tag);
			}
		}

		const siteCounts = new Map<string, number>();
		for (const item of items) {
			const site = item.getSiteName();
			if (site) {
				siteCounts.set(site, (siteCounts.get(site) ?? 0) + 1);
			}
		}
		for (const [site, count] of siteCounts) {
			if (count >= 2) {
				candidates.add(site);
			}
		}

		// More topics sharpen nothing: the question gets weaker as the option set grows.
		return Array.from(candidates).slice(0, MAX_TOPICS);
	}

	private async bookmarkItems(): Promise<ATBookmarkItem[]> {
		const did = this.settings.did;
		if (!did) {
			return [];
		}
		return new SembleSource(this.client, did).fetchItems(this, new Set<string>(), new Set<string>());
	}

	async checkAuth() {
		if (this.client.loggedIn) {
			return true;
		}
		const did = this.settings.did;
		if (did) {
			try {
				await Effect.runPromise(
					restoreSession(did).pipe(Effect.provideService(AtClient, this.client)),
				);
				return true;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				this.updateSettings((current) => ({ ...current, did: undefined }));
				new Notice(`Session expired (${message}). Please login by opening settings`);
				return false;
			}
		}
		new Notice("Please log in by opening settings");
		return false;
	}

	async activateView(v: string) {
		if (!await this.checkAuth()) {
			return;
		}

		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(v);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0] as WorkspaceLeaf;
			void workspace.revealLeaf(leaf);
			return;
		}

		// Our view could not be found in the workspace, create a new leaf
		leaf = workspace.getMostRecentLeaf()
		await leaf?.setViewState({ type: v, active: true });

		// "Reveal" the leaf in case it is in a collapsed sidebar
		if (leaf) {
			void workspace.revealLeaf(leaf);
		}
	}
}
