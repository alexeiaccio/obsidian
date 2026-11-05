/**
 * Even spatial distribution for a Canvas lens.
 *
 * Each group is laid out as a near-square grid of its items (so a cluster reads as
 * a block), then the group blocks are packed into shelves of a target row width
 * (so clusters fill the plane evenly instead of stacking in one column).
 *
 * Pure and deterministic — no Obsidian, no randomness.
 */

export interface LayoutItem {
	readonly id: string;
	readonly width?: number;
	readonly height?: number;
}

export interface LayoutGroup {
	readonly id: string;
	readonly label?: string;
	readonly items: readonly LayoutItem[];
}

export interface Rect {
	readonly x: number;
	readonly y: number;
	readonly width: number;
	readonly height: number;
}

export interface PlacedNode extends Rect {
	readonly id: string;
	readonly groupId: string;
}

export interface PlacedGroup extends Rect {
	readonly id: string;
	readonly label?: string;
	/** Header rect (the group label), at the top of the group block. */
	readonly header: Rect;
}

export interface LayoutOptions {
	readonly itemWidth?: number;
	readonly itemHeight?: number;
	/** Gap between items inside a group. */
	readonly gap?: number;
	/** Gap between group blocks. */
	readonly groupGap?: number;
	/** Height reserved for a group's label header. */
	readonly headerHeight?: number;
	/** Padding around the whole layout. */
	readonly padding?: number;
	/**
	 * Target width of a packed row; groups wrap past it. Defaults to a landscape
	 * rectangle proportional to the total area, which keeps the packing squarish.
	 */
	readonly rowWidth?: number;
}

export interface Layout {
	readonly nodes: readonly PlacedNode[];
	readonly groups: readonly PlacedGroup[];
	readonly width: number;
	readonly height: number;
}

const DEFAULTS = {
	itemWidth: 260,
	itemHeight: 80,
	gap: 40,
	groupGap: 140,
	headerHeight: 60,
	padding: 40,
} as const;

const grid = (count: number): { columns: number; rows: number } => {
	const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
	const rows = Math.ceil(count / columns);
	return { columns, rows: Math.max(1, rows) };
};

/**
 * Distribute `groups` (and their items) across the plane.
 *
 * Empty groups are kept (they render as a lone header) so a topic with nothing
 * filed into it is still visible.
 */
export const layoutGroups = (
	groups: readonly LayoutGroup[],
	options: LayoutOptions = {},
): Layout => {
	const itemWidth = options.itemWidth ?? DEFAULTS.itemWidth;
	const itemHeight = options.itemHeight ?? DEFAULTS.itemHeight;
	const gap = options.gap ?? DEFAULTS.gap;
	const groupGap = options.groupGap ?? DEFAULTS.groupGap;
	const headerHeight = options.headerHeight ?? DEFAULTS.headerHeight;
	const padding = options.padding ?? DEFAULTS.padding;

	const blocks = groups.map((group) => {
		const { columns, rows } = grid(group.items.length);
		const contentWidth = columns * itemWidth + (columns - 1) * gap;
		const contentHeight = rows * itemHeight + (rows - 1) * gap;
		return {
			group,
			columns,
			width: contentWidth,
			height: headerHeight + contentHeight,
		};
	});

	const totalArea = blocks.reduce(
		(sum, block) => sum + (block.width + groupGap) * (block.height + groupGap),
		0,
	);
	const rowWidth =
		options.rowWidth ?? Math.max(1, Math.ceil(Math.sqrt(totalArea) * 1.6));

	const nodes: PlacedNode[] = [];
	const placedGroups: PlacedGroup[] = [];
	let cursorX = padding;
	let cursorY = padding;
	let shelfHeight = 0;
	let maxX = padding;

	for (const block of blocks) {
		if (cursorX > padding && cursorX + block.width > padding + rowWidth) {
			cursorX = padding;
			cursorY += shelfHeight + groupGap;
			shelfHeight = 0;
		}

		const groupX = cursorX;
		const groupY = cursorY;

		placedGroups.push({
			id: block.group.id,
			label: block.group.label,
			x: groupX,
			y: groupY,
			width: block.width,
			height: block.height,
			header: { x: groupX, y: groupY, width: block.width, height: headerHeight },
		});

		block.group.items.forEach((item, index) => {
			const column = index % block.columns;
			const row = Math.floor(index / block.columns);
			nodes.push({
				id: item.id,
				groupId: block.group.id,
				x: groupX + column * (itemWidth + gap),
				y: groupY + headerHeight + row * (itemHeight + gap),
				width: item.width ?? itemWidth,
				height: item.height ?? itemHeight,
			});
		});

		maxX = Math.max(maxX, groupX + block.width);
		cursorX += block.width + groupGap;
		shelfHeight = Math.max(shelfHeight, block.height);
	}

	return {
		nodes,
		groups: placedGroups,
		width: maxX + padding,
		height: cursorY + shelfHeight + padding,
	};
};
