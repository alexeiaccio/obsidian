import { describe, expect, it } from "vitest";
import { layoutGroups, type LayoutGroup } from "./layout";

interface Box {
	x: number;
	y: number;
	width: number;
	height: number;
}

const overlaps = (a: Box, b: Box): boolean =>
	a.x < b.x + b.width &&
	a.x + a.width > b.x &&
	a.y < b.y + b.height &&
	a.y + a.height > b.y;

const makeGroups = (sizes: readonly number[]): LayoutGroup[] =>
	sizes.map((size, group) => ({
		id: `g${group}`,
		label: `group ${group}`,
		items: Array.from({ length: size }, (_, item) => ({ id: `g${group}-i${item}` })),
	}));

describe("layoutGroups", () => {
	it("places every item exactly once", () => {
		const groups = makeGroups([7, 1, 4, 12]);
		const layout = layoutGroups(groups);

		const expected = groups.flatMap((g) => g.items.map((i) => i.id)).sort();
		const actual = layout.nodes.map((n) => n.id).sort();

		expect(actual).toEqual(expected);
	});

	it("never overlaps two item nodes", () => {
		const layout = layoutGroups(makeGroups([9, 3, 6, 1, 20]));

		for (let a = 0; a < layout.nodes.length; a++) {
			for (let b = a + 1; b < layout.nodes.length; b++) {
				const left = layout.nodes[a];
				const right = layout.nodes[b];
				if (!left || !right) continue;
				expect(overlaps(left, right)).toBe(false);
			}
		}
	});

	it("keeps every item inside its group block", () => {
		const layout = layoutGroups(makeGroups([5, 8, 2]));
		const byId = new Map(layout.groups.map((g) => [g.id, g]));

		for (const node of layout.nodes) {
			const group = byId.get(node.groupId);
			expect(group).toBeDefined();
			if (!group) continue;
			expect(node.x).toBeGreaterThanOrEqual(group.x);
			expect(node.y).toBeGreaterThanOrEqual(group.y);
			expect(node.x + node.width).toBeLessThanOrEqual(group.x + group.width);
			expect(node.y + node.height).toBeLessThanOrEqual(group.y + group.height);
		}
	});

	it("keeps group blocks from overlapping and packs more than one row", () => {
		const layout = layoutGroups(makeGroups([4, 4, 4, 4, 4, 4, 4, 4]));
		const rows = new Set(layout.groups.map((g) => g.y));
		expect(rows.size).toBeGreaterThan(1);

		for (let a = 0; a < layout.groups.length; a++) {
			for (let b = a + 1; b < layout.groups.length; b++) {
				const left = layout.groups[a];
				const right = layout.groups[b];
				if (!left || !right) continue;
				expect(overlaps(left, right)).toBe(false);
			}
		}
	});

	it("handles an empty group and an entirely empty input", () => {
		const withEmpty = layoutGroups(makeGroups([3, 0, 2]));
		expect(withEmpty.groups).toHaveLength(3);
		expect(withEmpty.nodes).toHaveLength(5);

		const empty = layoutGroups([]);
		expect(empty.nodes).toHaveLength(0);
		expect(empty.groups).toHaveLength(0);
	});
});
