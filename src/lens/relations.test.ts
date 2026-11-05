import { describe, expect, it } from "vitest";
import type { ConnectionInfo } from "../sources/types";
import { applyRelationLens, relationTypes, renderRelations } from "./relations";

const relation = (over: Partial<ConnectionInfo>): ConnectionInfo => ({
	direction: "outgoing",
	...over,
});

const relations: ConnectionInfo[] = [
	relation({ direction: "outgoing", type: "SUPPORTS", url: "https://a.test", title: "A" }),
	relation({ direction: "outgoing", type: "opposes", url: "https://b.test", note: "why" }),
	relation({ direction: "incoming", type: "RELATED", title: "unresolved" }),
];

describe("applyRelationLens", () => {
	it("keeps everything with an empty lens", () => {
		expect(applyRelationLens(relations, {})).toHaveLength(3);
	});

	it("lenses by direction", () => {
		expect(applyRelationLens(relations, { direction: "outgoing" })).toHaveLength(2);
		expect(applyRelationLens(relations, { direction: "incoming" })).toHaveLength(1);
	});

	it("lenses by type, case-insensitively", () => {
		expect(applyRelationLens(relations, { types: ["supports"] })).toHaveLength(1);
		expect(applyRelationLens(relations, { types: ["OPPOSES", "related"] })).toHaveLength(2);
		expect(applyRelationLens(relations, { types: [] })).toHaveLength(3);
	});

	it("lenses to resolved relations only", () => {
		expect(applyRelationLens(relations, { resolvedOnly: true })).toHaveLength(2);
	});

	it("lenses to a limit", () => {
		expect(applyRelationLens(relations, { limit: 1 })).toHaveLength(1);
	});

	it("combines direction, type and resolution", () => {
		expect(
			applyRelationLens(relations, {
				direction: "outgoing",
				types: ["protests"],
				resolvedOnly: true,
			}),
		).toEqual([]);
	});
});

describe("relationTypes", () => {
	it("lists distinct types, sorted, ignoring missing ones", () => {
		expect(relationTypes([...relations, relation({})])).toEqual(["RELATED", "SUPPORTS", "opposes"]);
	});
});

describe("renderRelations", () => {
	it("renders nothing for no relations", () => {
		expect(renderRelations([])).toBe("");
	});

	it("renders a section with arrows, types, links and notes", () => {
		const markdown = renderRelations(relations, { heading: "Incoming" });
		expect(markdown).toContain("## Incoming");
		expect(markdown).toContain("- → **SUPPORTS** [A](https://a.test)");
		expect(markdown).toContain("- → **opposes** [https://b.test](https://b.test) — why");
		expect(markdown).toContain("- ← **RELATED** unresolved");
	});

	it("marks a typeless relation as related", () => {
		expect(renderRelations([relation({ url: "https://x.test", title: "X" })])).toContain(
			"- → related [X](https://x.test)",
		);
	});

	it("links a clipped endpoint as a wikilink, keeping the title as the alias", () => {
		const markdown = renderRelations(relations, {
			noteFor: (r) => (r.url === "https://a.test" ? "clips/semble/A" : undefined),
		});
		expect(markdown).toContain("- → **SUPPORTS** [[clips/semble/A|A]]");
		// Unclipped endpoints keep their URL.
		expect(markdown).toContain("- → **opposes** [https://b.test](https://b.test) — why");
	});

	it("drops the alias when the relation has no title", () => {
		expect(
			renderRelations([relation({ url: "https://c.test" })], {
				noteFor: () => "clips/semble/C",
			}),
		).toContain("- → related [[clips/semble/C]]");
	});
});
