/**
 * "Group by meaning" lens: ask TypeSafe's System One (Jev) to file each saved
 * link into one of the candidate topics, then lay the groups out on the active
 * Obsidian Canvas.
 *
 * Candidate topics come from the user's own collections/tags — Jev judges the
 * best fit, it does not invent labels — plus an `unsorted` escape hatch.
 *
 * Effect v4: the judging step is an `effect/ai` `Decision` answered by
 * `@effect/ai-typesafe`'s `DecisionModel`, so answers are schema-validated
 * instead of read off an untyped response.
 */
import { Cause, Effect, Redacted, Schema } from "effect";
import type { AllCanvasNodeData, CanvasEdgeData } from "obsidian/canvas.js";
import type { Scope } from "effect";
import { AiError, Decision, DecisionModel } from "effect/ai";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as TypeSafeClient from "@effect/ai-typesafe/TypeSafeClient";
import * as TypeSafeDecisionModel from "@effect/ai-typesafe/TypeSafeDecisionModel";
import * as Canvas from "../effect/Canvas";
import { notify } from "../effect/Notice";
import * as Plugin from "../effect/Plugin";
import { layoutGroups } from "./layout";
import { obsidianFetch } from "../lib/http";

/**
 * The `fetch` the AI client is handed.
 *
 * Strings only: a request with a stream body keeps the renderer's `fetch`, since
 * `requestUrl` takes no stream. The decision client sends JSON, so that is the
 * path that matters here.
 */
const fetchThroughObsidian = (
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> => {
	const url =
		typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
	return obsidianFetch({ url, init: init ?? {} });
};


// A type alias (not an interface) so it is assignable to the SDK's `JsonValue`
// state shape, which requires an implicit index signature.
export type TopicItem = {
	readonly id: string;
	readonly title?: string;
	readonly description?: string;
	readonly url?: string;
	readonly site?: string;
	readonly tags?: string[];
};

export interface TopicGroup {
	readonly topic: string;
	readonly items: readonly TopicItem[];
}

export const UNSORTED_TOPIC = "unsorted";

/** The item shape the decision input is encoded from. */
const TopicItemSchema = Schema.Struct({
	id: Schema.String,
	title: Schema.optional(Schema.String),
	description: Schema.optional(Schema.String),
	url: Schema.optional(Schema.String),
	site: Schema.optional(Schema.String),
	tags: Schema.optional(Schema.Array(Schema.String)),
});

const labelFor = (item: TopicItem): string =>
	item.title ?? item.url ?? item.id;

/**
 * The instruction for one item. The item's text MUST be in the question, not
 * only in the request `state`: System One answers each question against `state`
 * as a whole, so a batch of identically-worded questions over a list of items
 * degenerates (every item gets the escape hatch). Naming the item per question
 * is what makes batching work.
 */
const instructionsFor = (item: TopicItem): string => {
	const fields = [
		`title: ${labelFor(item)}`,
		item.description ? `description: ${item.description}` : undefined,
		item.url ? `url: ${item.url}` : undefined,
		item.site ? `site: ${item.site}` : undefined,
		item.tags && item.tags.length > 0 ? `tags: ${item.tags.join(", ")}` : undefined,
	].filter((field): field is string => field !== undefined);

	return `Saved link — ${fields.join("; ")}. Which topic best matches it? Choose the \`unsorted\` option when no topic fits.`;
};

/**
 * File every item into a topic with Jev.
 *
 * Questions run in batches (one `DecisionModel` call per batch) so a large
 * library does not put hundreds of questions in a single request.
 */
export const assignTopics = (params: {
	readonly apiKey: string;
	readonly items: readonly TopicItem[];
	readonly topics: readonly string[];
	readonly batchSize?: number;
}): Effect.Effect<readonly TopicGroup[], AiError.AiError> =>
	Effect.gen(function*() {
		const { items, topics } = params;
		const batchSize = params.batchSize ?? 20;

		if (items.length === 0 || topics.length === 0) {
			return [];
		}

		// Label keys stay opaque (`t0`, `t1`, …) so a topic name can never collide
		// with the escape hatch or with another key's meaning. The label *descriptions*
		// carry the topic text, which is what lets the model tell the labels apart.
		const topicByLabel = new Map<string, string>();
		const criteria: Record<string, string> = {};
		topics.forEach((topic, index) => {
			const label = `t${index}`;
			topicByLabel.set(label, topic);
			criteria[label] = topic;
		});
		criteria[UNSORTED_TOPIC] = "No topic fits; leave this link unsorted.";

		const input = Schema.Struct({ items: Schema.Array(TopicItemSchema) });
		const groups = new Map<string, TopicItem[]>();
		for (const topic of topics) {
			groups.set(topic, []);
		}
		groups.set(UNSORTED_TOPIC, []);

		for (let start = 0; start < items.length; start += batchSize) {
			const batch = items.slice(start, start + batchSize);

			const decisions: Record<string, Decision.Classify<string>> = {};
			batch.forEach((item, index) => {
				decisions[`item_${index}`] = Decision.classify({
					instructions: instructionsFor(item),
					criteria,
				});
			});

			const { answers } = yield* DecisionModel.decide(
				Decision.make({ input, decisions }),
				{ input: { items: batch } },
			);

			batch.forEach((item, index) => {
				const label = answers[`item_${index}`]?.label;
				const topic = label === undefined
					? UNSORTED_TOPIC
					: topicByLabel.get(label) ?? UNSORTED_TOPIC;
				const bucket = groups.get(topic) ?? [];
				bucket.push(item);
				groups.set(topic, bucket);
			});
		}

		return Array.from(groups.entries())
			.map(([topic, topicItems]) => ({ topic, items: topicItems }))
			.filter((group) => group.items.length > 0);
	}).pipe(
		Effect.provide(TypeSafeDecisionModel.model("jev-latest")),
		Effect.provide(TypeSafeClient.layer({ apiKey: Redacted.make(params.apiKey) })),
		Effect.provide(FetchHttpClient.layer),
		// The renderer's `fetch` cannot reach some hosts at all (it fails with a bare
		// "network error"); Obsidian's own client can be a different path through the
		// same network, so every decision goes through it.
		Effect.provideService(FetchHttpClient.Fetch, fetchThroughObsidian),
	);

/**
 * Create the group headers, item nodes and header→item edges on the active
 * canvas, positioned by the even-distribution layout.
 */
export interface DrawnGroups {
	readonly nodes: number;
	readonly edges: number;
}

/** 16 random hex characters, the shape canvas ids have. */
const freshId = (): string =>
	Array.from({ length: 16 }, () => ((16 * Math.random()) | 0).toString(16)).join("");

/**
 * Lay the groups out on the canvas in one `importData`.
 *
 * Node by node would be `canvas.createTextNode` per item, and a canvas that does
 * not re-render per call is a canvas that stays empty. Importing the whole shape
 * at once is also what Obsidian's own paste does, and `requestSave` makes it
 * survive a reload.
 */
export const renderTopicGroups = (
	groups: readonly TopicGroup[],
): Effect.Effect<DrawnGroups, never, Canvas.Canvas> =>
	Effect.gen(function*() {
		const canvas = yield* Canvas.Canvas;

		const byId = new Map<string, TopicItem>();
		for (const group of groups) {
			for (const item of group.items) {
				byId.set(item.id, item);
			}
		}

		const layout = layoutGroups(
			groups.map((group) => ({
				id: group.topic,
				label: group.topic,
				items: group.items.map((item) => ({ id: item.id })),
			})),
		);

		const nodeIds = new Map<string, string>();
		const nodes: AllCanvasNodeData[] = [];

		for (const group of layout.groups) {
			const id = freshId();
			nodeIds.set(`group:${group.id}`, id);
			nodes.push({
				id,
				type: "text",
				text: `## ${group.label ?? group.id}`,
				x: group.header.x,
				y: group.header.y,
				width: group.header.width,
				height: group.header.height,
			});
		}

		for (const node of layout.nodes) {
			const id = freshId();
			nodeIds.set(`item:${node.id}`, id);
			const item = byId.get(node.id);
			const label = item ? labelFor(item) : node.id;
			const url = item?.url ? `\n${item.url}` : "";
			nodes.push({
				id,
				type: "text",
				text: `${label}${url}`,
				x: node.x,
				y: node.y,
				width: node.width,
				height: node.height,
			});
		}

		const edges: CanvasEdgeData[] = [];
		for (const node of layout.nodes) {
			const from = nodeIds.get(`group:${node.groupId}`);
			const to = nodeIds.get(`item:${node.id}`);
			if (from === undefined || to === undefined) {
				continue;
			}
			edges.push({
				id: freshId(),
				fromNode: from,
				fromSide: "right",
				toNode: to,
				toSide: "left",
			});
		}

		yield* Effect.sync(() => {
			const data = canvas.getData();
			canvas.importData({
				nodes: [...data.nodes, ...nodes],
				edges: [...data.edges, ...edges],
			});
			canvas.requestSave();
		});

		return { nodes: nodes.length, edges: edges.length };
	});

/**
 * One line in the notice, the whole cause in the console.
 *
 * A pretty-printed cause is a wall of text in a toast — the useful part is the
 * first line, and the stack is what developer tools are for.
 */
const reportFailure = (what: string, cause: Cause.Cause<unknown>): Effect.Effect<void> => {
	const pretty = Cause.pretty(cause);
	const [first] = pretty.split("\n");
	return Effect.sync(() => console.error(`[clipper] ${what}`, pretty)).pipe(
		Effect.andThen(notify(`${what}: ${first ?? "unknown failure"}`)),
	);
};

/**
 * Register the "Group bookmarks by meaning" command. Enabled only when a canvas
 * is active; it fetches the candidates, asks Jev, then lays the groups out.
 */
export const topicGroupsCommand = (params: {
	readonly getItems: () => Promise<TopicItem[]>;
	readonly getTopics: () => Promise<string[]>;
	readonly getApiKey: () => string | undefined;
}): Effect.Effect<void, never, Plugin.Plugin | Scope.Scope> =>
	Canvas.addCommand({
		id: "group-by-meaning-on-canvas",
		name: "Group bookmarks by meaning on canvas",
		run: Effect.gen(function*() {
			const apiKey = params.getApiKey();
			if (!apiKey) {
				yield* notify("Set a TypeSafe API key in settings first.");
				return;
			}
			yield* notify("Reading saved links…");
			// a rejected read used to become a defect, which killed the command
			// silently: no notice, no error, nothing on the canvas
			const loaded = yield* Effect.tryPromise({
				try: () => Promise.all([params.getItems(), params.getTopics()]),
				catch: (cause) => (cause instanceof Error ? cause.message : String(cause)),
			}).pipe(
				Effect.catch((message) =>
					notify(`Could not read the saved links: ${message}`).pipe(
						Effect.map((): readonly [TopicItem[], string[]] | undefined => undefined),
					),
				),
			);
			if (loaded === undefined) {
				return;
			}
			const [items, topics] = loaded;
			if (items.length === 0 || topics.length === 0) {
				yield* notify(
					`Need both saved links and topics to group (${items.length} links, ${topics.length} topics).`,
				);
				return;
			}
			yield* notify(`Grouping ${items.length} links into ${topics.length} topics…`);
			// Exit, not catch: a defect in the model client used to end the command
			// with no notice at all, which reads as "it did nothing".
			const grouped = yield* Effect.exit(assignTopics({ apiKey, items, topics }));
			if (grouped._tag === "Failure") {
				yield* reportFailure("Could not group the links", grouped.cause);
				return;
			}
			const groups = grouped.value;
			if (groups.length === 0) {
				yield* notify("The model filed every link as unsorted, so there is nothing to draw.");
				return;
			}

			const drawn = yield* Effect.exit(renderTopicGroups(groups));
			if (drawn._tag === "Failure") {
				yield* reportFailure("Could not draw the groups", drawn.cause);
				return;
			}
			yield* notify(
				`Grouped ${items.length} links into ${groups.length} topics (${drawn.value.nodes} nodes, ${drawn.value.edges} edges).`,
			);
		}),
	});
