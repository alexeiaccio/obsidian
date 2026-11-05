import { Context, Effect, Layer, Option, Schema, Stream, SubscriptionRef } from "effect";
import type { App, Plugin as ObsidianPlugin, PluginSettingTab } from "obsidian";
import { Plugin } from "./Plugin";

/**
 * Effect v4 port of `tim-smart/effect-obsidian`'s `Settings` module (Effect v3).
 *
 * Settings live in a `SubscriptionRef`; the settings tab reads through `get` and
 * writes through `update`. Changes are Schema-encoded and saved (debounced).
 */

export interface SettingsService<A> {
	readonly ref: SubscriptionRef.SubscriptionRef<A>;
	readonly unsafeGet: () => A;
	readonly unsafeUpdate: (f: (current: A) => A) => void;
}

export type SettingTabFactory<A> = (
	get: () => A,
	update: (f: (current: A) => A) => void,
) => new (app: App, plugin: ObsidianPlugin) => PluginSettingTab;

export const layer = <A, I>(
	schema: Schema.Codec<A, I>,
	defaults: A,
	register: SettingTabFactory<A>,
) => {
	const tag = Context.Service<SettingsService<A>, SettingsService<A>>()("obsidian-clipper/Settings");

	const layer = Layer.effect(
		tag,
		Effect.gen(function*() {
			const plugin = yield* Plugin.useSync((p) => p);

			const raw = yield* Effect.promise(() => plugin.loadData());
			const initial = Option.getOrElse(
				Schema.decodeUnknownOption(schema)(raw ?? {}),
				() => defaults,
			);

			const ref = yield* SubscriptionRef.make(initial);

			yield* SubscriptionRef.changes(ref).pipe(
				Stream.drop(1),
				Stream.debounce("500 millis"),
				Stream.map((value) => Schema.encodeSync(schema)(value)),
				Stream.runForEach((encoded) => Effect.promise(() => plugin.saveData(encoded))),
				Effect.forkScoped,
			);

			const context = yield* Effect.context();

			const unsafeUpdate = (f: (current: A) => A): void => {
				Effect.runSyncWith(context)(SubscriptionRef.update(ref, f));
			};

			const Tab = register(() => ref.value, unsafeUpdate);
			plugin.addSettingTab(new Tab(plugin.app, plugin));

			return tag.of({
				ref,
				unsafeGet: () => ref.value,
				unsafeUpdate,
			});
		}),
	);

	return { tag, layer } as const;
};
