import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { Effect, Schema } from "effect";
import type ClipperPlugin from "./main";
import { isActorIdentifier } from "@atcute/lexicons/syntax";
import { BookmarksView, VIEW_TYPE_CLIPPER_BOOKMARKS } from "./views/bookmarks";
import { VIEW_CLIPPER_STANDARD_FEED } from "./views/standardfeed";
import { AtClient, login, loginWithAppPassword, logout } from "./effect/AtClient";
import type { SettingTabFactory } from "./effect/Settings";
import { DEFAULT_TEMPLATE } from "./effect/Template";


export interface AtProtoSettings {
	did?: string;
	clipDir: string;
	bookmarks: {
		enabledSources: Record<string, boolean>;
	}
	publish: {
		useFirstHeaderAsTitle: boolean;
	};
	github?: {
		login?: string;
		token?: string;
		maxItems?: number;
	};
	arc?: {
		maxItems?: number;
	};
	typesafeApiKey?: string;
	/** Optional comma-separated topic list for grouping. */
	topics?: string;
	/** Vault path of the tldraw file the map lens targets. */
	mapFile?: string;
	/** Markdown template for clipped notes; see effect/Template. */
	template?: string;
	/** Per-source template overrides; a blank or absent entry falls back to `template`. */
	templates?: Record<string, string>;
	/** Which Semble relations a clip keeps, and how they link. */
	relations?: {
		directions?: string;
		types?: string;
		resolvedOnly?: boolean;
		limit?: number;
		linkClippedNotes?: boolean;
	};
}

export const DEFAULT_SETTINGS: AtProtoSettings = {
	clipDir: "ClipperClips",
	bookmarks: {
		enabledSources: { "semble": true, "margin": true, "bookmark": true, "tangled": true, "github": false, "arc": true },
	},
	publish: {
		useFirstHeaderAsTitle: false,
	},
	github: {
		maxItems: 100,
	},
	arc: {
		maxItems: 200,
	},
};

export const AtProtoSettingsSchema: Schema.Codec<AtProtoSettings> = Schema.Struct({
	did: Schema.optional(Schema.String),
	clipDir: Schema.String,
	bookmarks: Schema.Struct({
		enabledSources: Schema.Record(Schema.String, Schema.Boolean),
	}),
	publish: Schema.Struct({
		useFirstHeaderAsTitle: Schema.Boolean,
	}),
	github: Schema.optional(Schema.Struct({
		login: Schema.optional(Schema.String),
		token: Schema.optional(Schema.String),
		maxItems: Schema.optional(Schema.Finite),
	})),
	arc: Schema.optional(Schema.Struct({
		maxItems: Schema.optional(Schema.Finite),
	})),
	typesafeApiKey: Schema.optional(Schema.String),
	topics: Schema.optional(Schema.String),
	mapFile: Schema.optional(Schema.String),
	template: Schema.optional(Schema.String),
	templates: Schema.optional(Schema.Record(Schema.String, Schema.String)),
	relations: Schema.optional(Schema.Struct({
		directions: Schema.optional(Schema.String),
		types: Schema.optional(Schema.String),
		resolvedOnly: Schema.optional(Schema.Boolean),
		limit: Schema.optional(Schema.Finite),
		linkClippedNotes: Schema.optional(Schema.Boolean),
	})),
});

/** The bookmark sources, in the order the settings and templates list them. */
const BOOKMARK_SOURCES: Array<{ name: string; label: string; desc: string }> = [
	{ name: "semble", label: "Semble", desc: "Include Semble bookmarks" },
	{ name: "margin", label: "Margin", desc: "Include Margin bookmarks" },
	{ name: "bookmark", label: "Community", desc: "Include community lexcion bookmarks" },
	{ name: "tangled", label: "Tangled", desc: "Include Tangled repo stars" },
	{ name: "github", label: "GitHub stars", desc: "Include your starred GitHub repos (set your login below)" },
	{ name: "arc", label: "Arc tabs", desc: "Include tabs from your Arc sidebar (macOS only)" },
];

export const makeSettingTab: SettingTabFactory<AtProtoSettings> = (get, update) =>
	class SettingTab extends PluginSettingTab {
		plugin: ClipperPlugin;

		constructor(app: App, plugin: ClipperPlugin) {
			super(app, plugin);
			this.plugin = plugin;
		}

		display(): void {
			const { containerEl } = this;
			containerEl.empty();
			const settings = get();

			if (this.plugin.client.loggedIn) {
				const displayName = this.plugin.client.actor?.handle || settings.did;

				new Setting(containerEl)
					.setName("Logged in as @" + displayName)
					.setDesc(this.plugin.client.actor?.did as string || "")
					.addButton((button) =>
						button
							.setButtonText("Log out")
							.setCta()
							.onClick(async () => {
								await Effect.runPromise(
									logout(settings.did!).pipe(
										Effect.provideService(AtClient, this.plugin.client),
									),
								);
								update((current) => ({ ...current, did: undefined }));

								// close all plugin views
								this.app.workspace.detachLeavesOfType(VIEW_TYPE_CLIPPER_BOOKMARKS);
								this.app.workspace.detachLeavesOfType(VIEW_CLIPPER_STANDARD_FEED);

								this.display();
								new Notice("Logged out successfully");
							})
					);
			} else {
				let handleInput: HTMLInputElement;

				new Setting(containerEl)
					.setName("Log in")
					.setDesc("Enter your handle (e.g., user.bsky.social)")
					.addText((text) => {
						handleInput = text.inputEl;
						text.setValue("");
					})
					.addButton((button) =>
						button
							.setButtonText("Log in")
							.setCta()
							.onClick(async () => {
								const handle = handleInput.value.trim();

								if (!handle) {
									new Notice("Please enter a handle.");
									return;
								}

								if (!isActorIdentifier(handle)) {
									new Notice("Invalid handle format. Please enter a valid handle (e.g., user.bsky.social).");
									return;
								}

								try {
									button.setDisabled(true);
									button.setButtonText("Logging in...");

									new Notice("Opening browser for authorization...");
									await Effect.runPromise(
										login(handle).pipe(
											Effect.provideService(AtClient, this.plugin.client),
										),
									);
									update((current) => ({ ...current, did: this.plugin.client.actor?.did }));

									this.display()
									new Notice(`Successfully logged in as ${this.plugin.client.actor!.handle}`);
								} catch (error) {
									console.error("Login failed:", error);
									const errorMessage = error instanceof Error ? error.message : String(error);
									new Notice(`Authentication failed: ${errorMessage}`);
									button.setDisabled(false);
									button.setButtonText("Log in");
								}
							})
					);

				// The browser leg is not always available. An app password signs in
				// without a popup: `com.atproto.server.createSession` against the
				// account's PDS, then a Bearer token on every request.
				new Setting(containerEl)
					.setName("Or sign in with an app password")
					.setHeading();

				let appPasswordIdentifier: HTMLInputElement;
				let appPasswordSecret: HTMLInputElement;

				new Setting(containerEl)
					.setName("Handle or email")
					.setDesc("The account to sign in as (e.g., user.bsky.social).")
					.addText((text) => {
						appPasswordIdentifier = text.inputEl;
						text.setValue("");
					});

				new Setting(containerEl)
					.setName("App password")
					.setDesc(
						"Create one at bsky.app → Settings → App passwords. It is stored in this vault's plugin data and can be revoked there at any time.",
					)
					.addText((text) => {
						appPasswordSecret = text.inputEl;
						text.inputEl.type = "password";
						text.setValue("");
					})
					.addButton((button) =>
						button
							.setButtonText("Sign in")
							.setCta()
							.onClick(async () => {
								const identifier = appPasswordIdentifier.value.trim();
								const password = appPasswordSecret.value.trim();

								if (!identifier) {
									new Notice("Please enter a handle or email.");
									return;
								}
								if (!isActorIdentifier(identifier)) {
									new Notice("Invalid handle format. Please enter a valid handle (e.g., user.bsky.social).");
									return;
								}
								if (!password) {
									new Notice("Please enter an app password.");
									return;
								}

								try {
									button.setDisabled(true);
									button.setButtonText("Signing in...");

									await Effect.runPromise(
										loginWithAppPassword({ identifier, password }).pipe(
											Effect.provideService(AtClient, this.plugin.client),
										),
									);
									update((current) => ({ ...current, did: this.plugin.client.actor?.did }));

									this.display();
									new Notice(`Signed in as ${this.plugin.client.actor!.handle}`);
								} catch (error) {
									console.error("App-password login failed:", error);
									const errorMessage = error instanceof Error ? error.message : String(error);
									new Notice(`Authentication failed: ${errorMessage}`);
									button.setDisabled(false);
									button.setButtonText("Sign in");
								}
							})
					);
			}

			new Setting(containerEl).setName("Clipping").setHeading();

			new Setting(containerEl)
				.setName("Clip directory")
				.setDesc("Directory in your vault to save clips (will be created if it doesn't exist)")
				.addText((text) =>
					text
						.setValue(settings.clipDir)
						.onChange((value) => {
							update((current) => ({ ...current, clipDir: value }));
						})
				);

			new Setting(containerEl)
				.setName("Note template")
				.setDesc(
					"Markdown for clipped notes. Start with a --- frontmatter block to set properties (they merge over the defaults). Item variables: {{title}} {{url}} {{description}} {{source}} {{site}} {{tags}} {{collections}} {{created}} {{uri}} {{notes}} {{connections}} {{connectionsIn}} {{connectionsOut}} {{highlights}}. Page variables fetch and extract the page: {{content}} {{author}} {{published}} {{image}} {{domain}} {{words}}.",
				)
				.addTextArea((text) => {
					text.inputEl.rows = 12;
					text.inputEl.addClass("clipper-template-input");
					text
						.setValue(settings.template ?? DEFAULT_TEMPLATE)
						.onChange((value) => {
							update((current) => ({ ...current, template: value }));
						});
				});


			new Setting(containerEl).setName("Templates by source").setHeading();
			new Setting(containerEl).setDesc(
				"Optional template per bookmark source, overriding the note template above. Blank means use the note template.",
			);

			for (const source of BOOKMARK_SOURCES) {
				new Setting(containerEl)
					.setName(source.label)
					.addTextArea((text) => {
						text.inputEl.rows = 6;
						text.inputEl.addClass("clipper-template-input");
						text
							.setPlaceholder("(use the note template)")
							.setValue(settings.templates?.[source.name] ?? "")
							.onChange((value) => {
								update((current) => {
									const templates = { ...current.templates };
									if (value.trim().length === 0) {
										delete templates[source.name];
									} else {
										templates[source.name] = value;
									}
									return { ...current, templates };
								});
							});
					});
			}


			new Setting(containerEl).setName("Relations").setHeading();
			new Setting(containerEl).setDesc(
				"Semble connections written into a clip. The template decides where: {{connections}}, {{connectionsIn}}, {{connectionsOut}}.",
			);

			new Setting(containerEl)
				.setName("Direction")
				.setDesc("Which way relations point, relative to the item being clipped")
				.addDropdown((dropdown) =>
					dropdown
						.addOption("both", "Both")
						.addOption("outgoing", "Outgoing only")
						.addOption("incoming", "Incoming only")
						.setValue(settings.relations?.directions ?? "both")
						.onChange((value) => {
							update((current) => ({
								...current,
								relations: { ...current.relations, directions: value },
							}));
						}),
				);

			new Setting(containerEl)
				.setName("Types")
				.setDesc("Optional comma-separated connection types to keep (e.g. SUPPORTS, OPPOSES). Blank keeps every type.")
				.addText((text) =>
					text.setValue(settings.relations?.types ?? "").onChange((value) => {
						update((current) => ({
							...current,
							relations: { ...current.relations, types: value.trim() },
						}));
					}),
				);

			new Setting(containerEl)
				.setName("Resolved only")
				.setDesc("Hide relations whose other endpoint could not be resolved to a URL")
				.addToggle((toggle) =>
					toggle.setValue(settings.relations?.resolvedOnly ?? false).onChange((value) => {
						update((current) => ({
							...current,
							relations: { ...current.relations, resolvedOnly: value },
						}));
					}),
				);

			new Setting(containerEl)
				.setName("Limit")
				.setDesc("Keep at most this many relations. Blank or 0 for no limit.")
				.addText((text) =>
					text
						.setValue(settings.relations?.limit ? String(settings.relations.limit) : "")
						.onChange((value) => {
							const limit = Number.parseInt(value.trim(), 10);
							update((current) => {
								const relations = { ...current.relations };
								if (Number.isFinite(limit) && limit > 0) {
									relations.limit = limit;
								} else {
									delete relations.limit;
								}
								return { ...current, relations };
							});
						}),
				);

			new Setting(containerEl)
				.setName("Link clipped notes")
				.setDesc("When a relation's other endpoint has already been clipped, link to that note instead of its URL")
				.addToggle((toggle) =>
					toggle.setValue(settings.relations?.linkClippedNotes ?? true).onChange((value) => {
						update((current) => ({
							...current,
							relations: { ...current.relations, linkClippedNotes: value },
						}));
					}),
				);


			new Setting(containerEl).setName("Bookmarks").setHeading()

			for (const source of BOOKMARK_SOURCES) {
				new Setting(containerEl)
					.setName(source.label)
					.setDesc(source.desc)
					.addToggle(toggle =>
						toggle
							.setValue(settings.bookmarks?.enabledSources?.[source.name] ?? true)
							.onChange(async (value) => {
								update((current) => ({
									...current,
									bookmarks: {
										...current.bookmarks,
										enabledSources: { ...current.bookmarks.enabledSources, [source.name]: value },
									},
								}));
								for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_CLIPPER_BOOKMARKS)) {
									let view = leaf.view as BookmarksView;
									if (view instanceof BookmarksView) {
										await view.render()
									}

								}
							})
					);
			}

			new Setting(containerEl).setName("GitHub stars").setHeading();
			new Setting(containerEl)
				.setName("GitHub login")
				.setDesc("Username whose starred repos to include")
				.addText((text) =>
					text
						.setValue(settings.github?.login ?? "")
						.onChange((value) => {
							update((current) => ({ ...current, github: { ...current.github, login: value.trim() } }));
						})
				);
			new Setting(containerEl)
				.setName("GitHub token")
				.setDesc("Optional personal access token, raises the API rate limit")
				.addText((text) => {
					text.inputEl.type = "password";
					text
						.setValue(settings.github?.token ?? "")
						.onChange((value) => {
							update((current) => ({ ...current, github: { ...current.github, token: value.trim() } }));
						});
				});
			new Setting(containerEl)
				.setName("GitHub max items")
				.addText((text) =>
					text
						.setValue(String(settings.github?.maxItems ?? 100))
						.onChange((value) => {
							const n = Number.parseInt(value, 10);
							update((current) => ({ ...current, github: { ...current.github, maxItems: Number.isFinite(n) ? n : undefined } }));
						})
				);

			new Setting(containerEl).setName("Arc tabs").setHeading();
			new Setting(containerEl)
				.setName("Arc max items")
				.setDesc("How many sidebar tabs (newest first) to show")
				.addText((text) =>
					text
						.setValue(String(settings.arc?.maxItems ?? 200))
						.onChange((value) => {
							const n = Number.parseInt(value, 10);
							update((current) => ({ ...current, arc: { ...current.arc, maxItems: Number.isFinite(n) ? n : undefined } }));
						})
				);

			new Setting(containerEl).setName("Map").setHeading();
		new Setting(containerEl)
			.setName("tldraw file")
			.setDesc("Vault tldraw file the map lens targets")
			.addDropdown((dropdown) => {
				const files = this.app.vault
					.getFiles()
					.filter((file) => /\.tldr(aw)?$/i.test(file.path))
					.map((file) => file.path)
					.sort();
				dropdown.addOption("", "(none)");
				for (const path of files) {
					dropdown.addOption(path, path);
				}
				if (settings.mapFile && !files.includes(settings.mapFile)) {
					dropdown.addOption(settings.mapFile, `${settings.mapFile} (missing)`);
				}
				dropdown.setValue(settings.mapFile ?? "");
				dropdown.onChange((value) => {
					update((current) => ({ ...current, mapFile: value || undefined }));
				});
			});

		new Setting(containerEl).setName("Meaning").setHeading();
		new Setting(containerEl)
			.setName("Topics")
			.setDesc("Optional comma-separated topics for grouping. Your collections, tags and repeated sites are used when empty.")
			.addText((text) =>
				text
					.setValue(settings.topics ?? "")
					.onChange((value) => {
						update((current) => ({ ...current, topics: value.trim() || undefined }));
					})
			);
		new Setting(containerEl)
			.setName("TypeSafe API key")
			.setDesc("Used by 'Group bookmarks by meaning' (Jev). Stored in this vault's plugin data.")
			.addText((text) => {
				text.inputEl.type = "password";
				text
					.setValue(settings.typesafeApiKey ?? "")
					.onChange((value) => {
						update((current) => ({ ...current, typesafeApiKey: value.trim() || undefined }));
					});
			});

		new Setting(containerEl).setName("Publishing").setHeading()
			new Setting(containerEl)
				.setName("Use first header as publish title")
				.setDesc('Use the first level one header instead of filename when no title property is set')
				.addToggle((toggle) =>
					toggle
						.setValue(settings.publish.useFirstHeaderAsTitle)
						.onChange((value) => {
							update((current) => ({ ...current, publish: { ...current.publish, useFirstHeaderAsTitle: value } }));
						})
				);
		}
	};
