import { Context, Effect, Exit, Scope } from "effect";
import * as Obsidian from "obsidian";

/**
 * Effect v4 port of `tim-smart/effect-obsidian`'s `Plugin` module (which targets
 * Effect v3). The shape is the same: a `Plugin` service, an `EffectPlugin` base
 * whose `run()` is a scoped Effect, and Effect-based command registration.
 */

/** The Obsidian plugin instance, available to every effect the plugin runs. */
export class Plugin extends Context.Service<Plugin, Obsidian.Plugin>()("obsidian-clipper/Plugin") {}

/** The active editor, provided to editor commands. */
export class Editor extends Context.Service<Editor, Obsidian.Editor>()("obsidian-clipper/Plugin/Editor") {}

/** The active markdown view, provided to editor commands. */
export class MarkdownView extends Context.Service<
	MarkdownView,
	Obsidian.MarkdownView | Obsidian.MarkdownFileInfo
>()("obsidian-clipper/Plugin/MarkdownView") {}

/**
 * Base class for an Effect-driven Obsidian plugin.
 *
 * `run()` is an Effect carrying a `Scope`; the scope closes on `onunload`, so any
 * `Effect.forkScoped` work (streams, listeners) is interrupted with the plugin.
 */
export abstract class EffectPlugin<E = never> extends Obsidian.Plugin {
	private scope: Scope.Closeable | undefined;

	protected abstract run(): Effect.Effect<void, E, Plugin | Scope.Scope>;

	onload(): Promise<void> {
		this.scope = Scope.makeUnsafe();
		return Effect.runPromise(
			this.run().pipe(
				Effect.provideService(Plugin, this),
				Effect.provideService(Scope.Scope, this.scope),
			),
		);
	}

	onunload(): void {
		if (this.scope) {
			Effect.runFork(Scope.close(this.scope, Exit.succeed(undefined)));
			this.scope = undefined;
		}
	}
}

export interface Command<R, E> extends Omit<
	Obsidian.Command,
	"callback" | "checkCallback" | "editorCallback" | "editorCheckCallback"
> {
	readonly run: Effect.Effect<void, E, R>;
	readonly check?: Effect.Effect<boolean, E, R>;
}

/** Register an Obsidian command whose body is an Effect. */
export const addCommand = <R, E>(
	command: Command<R, E>,
): Effect.Effect<void, never, R | Plugin | Scope.Scope> =>
	Effect.gen(function*() {
		const plugin = yield* Plugin.useSync((p) => p);
		const context = yield* Effect.context<R | Plugin | Scope.Scope>();
		const run = Effect.runForkWith(context);
		const { run: body, check, ...base } = command;

		if (check) {
			const runSync = Effect.runSyncWith(context);
			plugin.addCommand({
				...base,
				checkCallback(checking: boolean) {
					const canRun = runSync(check);
					if (canRun && !checking) {
						run(body);
					}
					return canRun;
				},
			});
		} else {
			plugin.addCommand({
				...base,
				callback() {
					run(body);
				},
			});
		}
	});

/** Register an editor command; `Editor` and `MarkdownView` are provided to its effect. */
export const addCommandEditor = <R, E>(
	command: Command<R, E>,
): Effect.Effect<void, never, R | Plugin | Scope.Scope> =>
	Effect.gen(function*() {
		const plugin = yield* Plugin.useSync((p) => p);
		const context = yield* Effect.context<R | Plugin | Scope.Scope>();
		const run = Effect.runForkWith(context);
		const { run: body, check, ...base } = command;

		const provide = <A, E2, R2>(
			effect: Effect.Effect<A, E2, R2>,
			editor: Obsidian.Editor,
			view: Obsidian.MarkdownView | Obsidian.MarkdownFileInfo,
		) =>
			effect.pipe(
				Effect.provideService(Editor, editor),
				Effect.provideService(MarkdownView, view),
			);

		if (check) {
			const runSync = Effect.runSyncWith(context);
			plugin.addCommand({
				...base,
				editorCheckCallback(checking, editor, view) {
					const canRun = runSync(provide(check, editor, view));
					if (canRun && !checking) {
						run(provide(body, editor, view));
					}
					return canRun;
				},
			});
		} else {
			plugin.addCommand({
				...base,
				editorCallback(editor, view) {
					run(provide(body, editor, view));
				},
			});
		}
	});
