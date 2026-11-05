import { Effect } from "effect";
import { Notice } from "obsidian";

/**
 * Show an Obsidian notice.
 *
 * Obsidian's UI is callback-driven, so this is the single place the plugin's
 * Effect code touches it — the lenses, the protocol handler and the clipper all
 * route their notices here instead of wrapping `new Notice` in `Effect.sync`.
 */
export const notify = (message: string): Effect.Effect<void> =>
	Effect.sync(() => {
		new Notice(message);
	});
