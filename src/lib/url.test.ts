import { describe, expect, it } from "vitest";
import { normalizeUrl, sameUrl } from "./url";

describe("normalizeUrl", () => {
	it("ignores the fragment", () => {
		expect(normalizeUrl("https://a.test/post#section-3")).toBe("https://a.test/post");
	});

	it("drops tracking parameters and keeps the real ones", () => {
		expect(normalizeUrl("https://a.test/post?utm_source=x&page=2&utm_medium=y")).toBe(
			"https://a.test/post?page=2",
		);
	});

	it("treats parameters as unordered", () => {
		expect(normalizeUrl("https://a.test/p?b=2&a=1")).toBe(normalizeUrl("https://a.test/p?a=1&b=2"));
	});

	it("ignores a trailing slash, but not a bare root", () => {
		expect(normalizeUrl("https://a.test/post/")).toBe(normalizeUrl("https://a.test/post"));
		expect(normalizeUrl("https://a.test/")).toBe("https://a.test/");
	});

	it("keeps a parameter that happens to share a prefix with tracking ones", () => {
		expect(normalizeUrl("https://a.test/p?s=keep")).toBe("https://a.test/p");
		expect(normalizeUrl("https://a.test/p?site=kept")).toBe("https://a.test/p?site=kept");
	});

	it("returns non-URLs as written rather than throwing", () => {
		expect(normalizeUrl("not a url")).toBe("not a url");
	});
});

describe("sameUrl", () => {
	it("matches across a fragment and tracking parameters", () => {
		expect(sameUrl("https://a.test/post#x", "https://a.test/post?utm_source=nl")).toBe(true);
	});

	it("does not match undefined or different pages", () => {
		expect(sameUrl(undefined, "https://a.test/post")).toBe(false);
		expect(sameUrl("https://a.test/post", undefined)).toBe(false);
		expect(sameUrl("https://a.test/one", "https://a.test/two")).toBe(false);
	});
});
