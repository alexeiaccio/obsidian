/**
 * @since 1.0.0
 */
import { Array, Effect, Option, Order, pipe } from "effect";
import * as Canvas from "../Canvas";

/**
 * Effect v4 port of `tim-smart/effect-obsidian`'s `Canvas/Node` module. The v3
 * `Order.struct` / `Order.number` became `Order.Struct` / `Order.Number`.
 */

/**
 * @since 1.0.0
 * @category order
 */
export const yOrder: Order.Order<{ y: number }> = Order.Struct({
	y: Order.Number,
});

/**
 * @since 1.0.0
 * @category combinators
 */
export const parent = (
	node: Canvas.CanvasNode,
): Effect.Effect<Option.Option<Canvas.CanvasNode>, never, Canvas.Canvas> =>
	Effect.gen(function* () {
		const canvas = yield* Canvas.Canvas;
		return pipe(
			canvas.getEdgesForNode(node),
			Array.findFirst((edge) => edge.to.node.id === node.id),
			Option.map((_) => _.from.node),
		);
	});

/**
 * @since 1.0.0
 * @category combinators
 */
export const children = (
	node: Canvas.CanvasNode,
): Effect.Effect<ReadonlyArray<Canvas.CanvasNode>, never, Canvas.Canvas> =>
	Effect.gen(function* () {
		const canvas = yield* Canvas.Canvas;
		return childrenFromEdges(node, canvas.getEdgesForNode(node));
	});

/**
 * @since 1.0.0
 * @category combinators
 */
export const childrenFromEdges = (
	node: Canvas.CanvasNode,
	edges: ReadonlyArray<Canvas.CanvasEdge>,
	leftToRight = false,
): ReadonlyArray<Canvas.CanvasNode> =>
	pipe(
		Array.filter(edges, (_) => _.from.node.id === node.id),
		(fromEdges) =>
			leftToRight
				? Array.filter(
						fromEdges,
						(_) => _.from.side === "right" && _.to.side === "left",
					)
				: fromEdges,
		Array.map((_) => _.to.node),
		Array.sort(yOrder),
	);

/**
 * @since 1.0.0
 * @category combinators
 */
export const siblings = (
	node: Canvas.CanvasNode,
): Effect.Effect<Array<Canvas.CanvasNode>, never, Canvas.Canvas> =>
	Effect.gen(function* () {
		const canvas = yield* Canvas.Canvas;
		const parentNode = yield* parent(node);
		return parentNode.pipe(
			Option.map((parent) =>
				pipe(
					canvas.getEdgesForNode(parent),
					Array.filter((_) => _.from.node.id === parent.id),
					Array.map((_) => _.to.node),
					Array.sort(yOrder),
				),
			),
			Option.getOrElse(() => []),
		);
	});
