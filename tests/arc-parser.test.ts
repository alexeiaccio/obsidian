import { expect, test, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArcJson, flattenItems } from "../src/arc-parser";

const TEST_DIR = resolve(__dirname, ".test-tmp-arc");

const sampleArcJson = {
	sidebar: {
		containers: [
			{},
			{
				items: [
					{
						id: "space1",
						parentID: "",
						childrenIds: ["item1", "item2"],
						title: "Dev Space",
						data: {},
					},
					{
						id: "item1",
						parentID: "space1",
						childrenIds: [],
						title: "",
						data: {
							tab: {
								savedTitle: "React Docs",
								savedURL: "https://react.dev",
							},
						},
					},
					{
						id: "item2",
						parentID: "space1",
						childrenIds: ["item3"],
						title: "",
						data: {
							tab: {
								savedTitle: "TypeScript",
								savedURL: "https://typescriptlang.org",
							},
						},
					},
					{
						id: "item3",
						parentID: "item2",
						childrenIds: [],
						title: "",
						data: {
							tab: {
								savedTitle: "TS Handbook",
								savedURL: "https://typescriptlang.org/docs",
							},
						},
					},
				],
				spaces: [
					{
						id: "s1",
						title: "Dev",
						containerIDs: ["pinned", "space1"],
					},
				],
			},
		],
	},
};

beforeEach(async () => {
	await mkdir(TEST_DIR, { recursive: true });
	await writeFile(
		resolve(TEST_DIR, "StorableSidebar.json"),
		JSON.stringify(sampleArcJson),
	);
});

afterEach(async () => {
	await rm(TEST_DIR, { recursive: true, force: true });
});

test("parseArcJson extracts spaces and items", async () => {
	const result = await parseArcJson(resolve(TEST_DIR, "StorableSidebar.json"));
	expect(result.spaces).toHaveLength(1);
	expect(result.spaces[0].title).toBe("Dev");
	expect(result.spaces[0].item.children).toHaveLength(2);
});

test("parseArcJson extracts URLs from tabs", async () => {
	const result = await parseArcJson(resolve(TEST_DIR, "StorableSidebar.json"));
	const firstChild = result.spaces[0].item.children[0];
	expect(firstChild.url).toBe("https://react.dev");
	expect(firstChild.title).toBe("React Docs");
});

test("flattenItems collects all URL items recursively", async () => {
	const result = await parseArcJson(resolve(TEST_DIR, "StorableSidebar.json"));
	const flat = flattenItems(result.spaces[0].item);
	expect(flat).toHaveLength(3); // item1, item2, item3 (nested)
	expect(flat.map((i) => i.url)).toContain("https://typescriptlang.org/docs");
});

test("parseArcJson handles empty spaces", async () => {
	const emptyJson = {
		sidebar: {
			containers: [{}, { items: [], spaces: [] }],
		},
	};
	await writeFile(
		resolve(TEST_DIR, "StorableSidebar.json"),
		JSON.stringify(emptyJson),
	);
	const result = await parseArcJson(resolve(TEST_DIR, "StorableSidebar.json"));
	expect(result.spaces).toHaveLength(0);
});
