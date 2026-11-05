import { describe, expect, it } from "vitest";
import {
	DEFAULT_TEMPLATE,
	PAGE_VARIABLES,
	renderTemplate,
	splitFrontmatter,
	substituteDeep,
	usedVariables,
} from "./Template";

describe("renderTemplate", () => {
	it("substitutes a value", () => {
		expect(renderTemplate("# {{title}}", { title: "Hello" })).toBe("# Hello");
	});

	it("uses the fallback when a variable is missing or empty", () => {
		expect(renderTemplate("{{author|Unknown}}", {})).toBe("Unknown");
		expect(renderTemplate("{{author|Unknown}}", { author: "" })).toBe("Unknown");
	});

	it("drops an unknown variable with no fallback instead of leaking it", () => {
		expect(renderTemplate("a{{nope}}b", {})).toBe("ab");
	});

	it("tolerates whitespace inside the braces", () => {
		expect(renderTemplate("{{  title  }}", { title: "x" })).toBe("x");
	});

	it("collapses the gaps left by empty sections", () => {
		expect(renderTemplate("a\n\n\n\nb", {})).toBe("a\n\nb");
		expect(renderTemplate("a\n\n\n", {})).toBe("a");
	});

	it("reports which variables a template uses, once each", () => {
		expect(usedVariables("{{title}} {{ content }} {{title}}").sort()).toEqual(["content", "title"]);
	});

	it("keeps the default template self-consistent", () => {
		const used = usedVariables(DEFAULT_TEMPLATE);
		// Every name the default references must be one we actually provide.
		const provided = new Set(["title", "description", "url", "notes", "connections"]);
		expect(used.filter((name) => !provided.has(name))).toEqual([]);
		expect(used.filter((name) => PAGE_VARIABLES.has(name))).toEqual([]);
	});
});

describe("splitFrontmatter", () => {
	it("splits a leading YAML block from the body", () => {
		expect(splitFrontmatter("---\ntitle: x\n---\n# Body")).toEqual({
			yaml: "title: x",
			body: "# Body",
		});
	});

	it("treats a template with no fence as all body", () => {
		expect(splitFrontmatter("# Body")).toEqual({ body: "# Body" });
	});

	it("ignores an empty fence", () => {
		expect(splitFrontmatter("---\n\n---\n# Body")).toEqual({ body: "# Body" });
	});

	it("does not mistake a horizontal rule mid-document for frontmatter", () => {
		const template = "# Title\n\n---\n\nmore";
		expect(splitFrontmatter(template)).toEqual({ body: template });
	});

	it("takes the whole default template as body", () => {
		expect(splitFrontmatter(DEFAULT_TEMPLATE)).toEqual({ body: DEFAULT_TEMPLATE });
	});
});

describe("substituteDeep", () => {
	it("fills strings inside objects and arrays", () => {
		expect(substituteDeep({ a: "{{x}}", b: ["{{y}}", 1] }, { x: "1", y: "2" })).toEqual({
			a: "1",
			b: ["2", 1],
		});
	});

	it("leaves non-strings alone", () => {
		expect(substituteDeep({ n: 3, b: true, z: null }, {})).toEqual({ n: 3, b: true, z: null });
	});
});
