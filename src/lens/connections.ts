/**
 * Canvas "lens": project Semble connections onto the active Obsidian Canvas.
 *
 * Each `ConnectionInfo` describes one endpoint of a connection (the *other* card
 * relative to the item being viewed) as a `url`/`title` pair. `drawConnections`
 * resolves that endpoint to a canvas node and draws an edge anchored on the
 * canvas's selected node(s): outgoing runs anchor -> endpoint, incoming runs
 * endpoint -> anchor. When nothing is selected it falls back to pairing the
 * endpoint's `url`-matched node with its `title`-matched node, so a connection
 * whose two identifiers resolve to two distinct nodes still yields an edge.
 *
 * Effect v4 port; the Canvas service lives in ../effect/Canvas.
 */
import { Effect } from "effect";
import type { Scope } from "effect";
import * as Canvas from "../effect/Canvas";
import * as Plugin from "../effect/Plugin";
import type { ConnectionInfo } from "../sources/types";

/**
 * Normalise a match key: trim, lowercase, strip trailing slash(es).
 */
const normalise = (value: string): string =>
	value.trim().toLowerCase().replace(/\/+$/, "");

const basename = (path: string): string => {
	const name = path.split("/").pop() ?? path;
	return name.replace(/\.[^./]+$/, "");
};

/**
 * Keys a canvas node can be matched by. `strong` (url, file basename) outrank
 * `text` (first line) when two nodes normalise to the same key.
 */
const nodeKeys = (
	node: Canvas.CanvasNode,
): { strong: string[]; text: string[] } => {
	const strong: string[] = [];
	const text: string[] = [];

	if (typeof node.url === "string" && node.url.length > 0) {
		strong.push(node.url);
	}

	const file = node.file;
	if (typeof file === "string" && file.length > 0) {
		strong.push(basename(file));
	} else if (file && typeof file.basename === "string") {
		strong.push(file.basename);
	} else if (file && typeof file.name === "string") {
		strong.push(basename(file.name));
	}

	if (typeof node.text === "string" && node.text.length > 0) {
		const firstLine = node.text.split("\n")[0] ?? "";
		if (firstLine.trim().length > 0) {
			text.push(firstLine);
		}
	}

	return { strong, text };
};

/**
 * Index the canvas nodes by every normalised key they expose. First writer
 * wins, and all `strong` keys are inserted before any `text` key.
 */
const buildIndex = (
	nodes: Iterable<Canvas.CanvasNode>,
): Map<string, Canvas.CanvasNode> => {
	const all = Array.from(nodes);
	const index = new Map<string, Canvas.CanvasNode>();
	const add = (raw: string, node: Canvas.CanvasNode): void => {
		const key = normalise(raw);
		if (key.length > 0 && !index.has(key)) {
			index.set(key, node);
		}
	};

	for (const node of all) {
		for (const key of nodeKeys(node).strong) {
			add(key, node);
		}
	}
	for (const node of all) {
		for (const key of nodeKeys(node).text) {
			add(key, node);
		}
	}

	return index;
};

/**
 * Resolve a connection's `url` and `title` to distinct canvas nodes.
 */
const matchEndpoint = (
	index: Map<string, Canvas.CanvasNode>,
	connection: ConnectionInfo,
): Canvas.CanvasNode[] => {
	const matched: Canvas.CanvasNode[] = [];
	const seen = new Set<string>();
	for (const value of [connection.url, connection.title]) {
		if (!value) {
			continue;
		}
		const node = index.get(normalise(value));
		if (node && !seen.has(node.id)) {
			seen.add(node.id);
			matched.push(node);
		}
	}
	return matched;
};

/**
 * Draw an edge for every Semble connection endpoint that matches a node on the
 * active canvas. Returns the number of edges created; unmatched endpoints and
 * edges that already exist are skipped.
 */
export const drawConnections = (
	connections: ConnectionInfo[],
): Effect.Effect<number, never, Canvas.Canvas> =>
	Effect.gen(function* () {
		const canvas = yield* Canvas.Canvas;
		const index = buildIndex(canvas.nodes.values());
		const anchors = Array.from(canvas.selection);
		const existing = new Set<string>();
		for (const edge of canvas.edges.values()) {
			existing.add(`${edge.from.node.id}->${edge.to.node.id}`);
		}

		let created = 0;
		for (const connection of connections) {
			const matched = matchEndpoint(index, connection);
			if (matched.length === 0) {
				continue;
			}

			const pairs: Array<{ from: Canvas.CanvasNode; to: Canvas.CanvasNode }> =
				[];
			if (anchors.length > 0) {
				for (const anchor of anchors) {
					for (const node of matched) {
						pairs.push(
							connection.direction === "incoming"
								? { from: node, to: anchor }
								: { from: anchor, to: node },
						);
					}
				}
			} else {
				const from = matched[0];
				const to = matched[1];
				if (from && to) {
					pairs.push({ from, to });
				}
			}

			for (const pair of pairs) {
				if (pair.from.id === pair.to.id) {
					continue;
				}
				const key = `${pair.from.id}->${pair.to.id}`;
				if (existing.has(key)) {
					continue;
				}
				existing.add(key);
				yield* Canvas.createEdge({ from: pair.from, to: pair.to });
				created++;
			}
		}

		return created;
	});

/**
 * Register the "Draw connections on canvas" command. The command is enabled
 * only when a canvas view is active (see Canvas.addCommand) and runs
 * `getConnections()` before projecting the result onto that canvas.
 */
export const connectionsCommand = (
	getConnections: () => Promise<ConnectionInfo[]>,
): Effect.Effect<void, never, Plugin.Plugin | Scope.Scope> =>
	Canvas.addCommand({
		id: "draw-connections-on-canvas",
		name: "Draw connections on canvas",
		run: Effect.gen(function* () {
			const connections = yield* Effect.promise(getConnections);
			yield* drawConnections(connections);
		}),
	});
