// tests/vault.test.ts
import { describe, expect, test } from "vitest";
import {
	sanitizeFileName,
	parseFrontmatter,
	stringifyFrontmatter,
	mergeFrontmatter,
} from "../scripts/vault";

describe("sanitizeFileName", () => {
	test("removes invalid characters", () => {
		expect(sanitizeFileName('file<>:"/\\|?*name')).toBe("file---------name");
	});

	test("trims whitespace", () => {
		expect(sanitizeFileName("  hello  ")).toBe("hello");
	});

	test("collapses multiple spaces", () => {
		expect(sanitizeFileName("hello    world")).toBe("hello world");
	});
});

describe("parseFrontmatter", () => {
	test("parses simple frontmatter", () => {
		const input = `---
source: arc
url: "https://example.com"
tags: [React, TypeScript]
created: 2026-04-13
---

# Content here`;
		const { frontmatter, body } = parseFrontmatter(input);
		expect(frontmatter.source).toBe("arc");
		expect(frontmatter.url).toBe("https://example.com");
		expect(frontmatter.tags).toEqual(["React", "TypeScript"]);
		expect(body).toContain("# Content here");
	});

	test("handles missing frontmatter", () => {
		const { frontmatter, body } = parseFrontmatter("just content");
		expect(frontmatter).toEqual({});
		expect(body).toBe("just content");
	});

	test("handles empty frontmatter", () => {
		const input = `---
---

content`;
		const { frontmatter, body } = parseFrontmatter(input);
		expect(frontmatter).toEqual({});
		expect(body.trim()).toBe("content");
	});

	test("parses numeric values", () => {
		const input = `---
count: 42
---
body`;
		const { frontmatter } = parseFrontmatter(input);
		expect(frontmatter.count).toBe(42);
	});
});

describe("stringifyFrontmatter", () => {
	test("creates valid frontmatter block", () => {
		const result = stringifyFrontmatter(
			{ source: "arc", tags: ["React"] },
			"# Title",
		);
		expect(result).toContain('---\nsource: "arc"');
		expect(result).toContain('tags: ["React"]');
		expect(result).toContain("---\n\n# Title");
	});

	test("handles empty tags array", () => {
		const result = stringifyFrontmatter({ tags: [] }, "# Title");
		expect(result).toContain("tags: []");
	});
});

describe("mergeFrontmatter", () => {
	test("merges arrays without duplicates", () => {
		const existing = { tags: ["React", "TypeScript"] };
		const updates = { tags: ["TypeScript", "CSS"], source: "arc" };
		const merged = mergeFrontmatter(existing, updates);
		expect(merged.tags).toEqual(["React", "TypeScript", "CSS"]);
		expect(merged.source).toBe("arc");
	});

	test("overwrites non-array values", () => {
		const existing = { source: "arc" };
		const updates = { source: "github" };
		const merged = mergeFrontmatter(existing, updates);
		expect(merged.source).toBe("github");
	});
});
