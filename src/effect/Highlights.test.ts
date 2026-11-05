import { describe, expect, it } from "vitest";
import { noteRecord } from "./Highlights";

describe("noteRecord", () => {
	it("always carries the fields the lexicon requires", () => {
		const record = noteRecord({ url: "https://a.test", motivation: "highlighting", exact: "hi" });

		expect(record.motivation).toBe("highlighting");
		expect(record.target.source).toBe("https://a.test");
		expect(typeof record.createdAt).toBe("string");
	});

	it("discriminates the selector with the W3C type field, not an atproto $type", () => {
		const record = noteRecord({ url: "https://a.test", motivation: "highlighting", exact: "hi" });

		expect(record.target.selector).toEqual({ type: "TextQuoteSelector", exact: "hi" });
		expect(record.target.selector).not.toHaveProperty("$type");
	});

	it("omits the body without a note and adds it with one", () => {
		expect(
			noteRecord({ url: "u", motivation: "highlighting", exact: "x" }).body,
		).toBeUndefined();
		expect(
			noteRecord({ url: "u", motivation: "commenting", exact: "x", note: "why" }).body,
		).toEqual({ format: "text/plain", value: "why" });
	});

	it("omits the selector for a bookmark, which has no selection", () => {
		const record = noteRecord({ url: "u", motivation: "bookmarking", title: "T" });

		expect(record.target.selector).toBeUndefined();
		expect(record.target.title).toBe("T");
	});

	it("keeps the title inside the lexicon's 500 characters", () => {
		const record = noteRecord({ url: "u", motivation: "bookmarking", title: "t".repeat(600) });

		expect(record.target.title).toHaveLength(500);
	});

	it("identifies the client that wrote the record", () => {
		expect(
			noteRecord({ url: "u", motivation: "highlighting", exact: "x" }).generator?.name,
		).toBe("Obsidian Clipper");
	});
});
