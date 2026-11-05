/**
 * Note templates, in the spirit of Obsidian Web Clipper: a Markdown string with
 * `{{variable}}` placeholders.
 *
 * Deliberately pure — no Obsidian import — so the substitution has a unit test.
 */

export type TemplateVariables = Readonly<Record<string, string | undefined>>;

/**
 * `{{name}}` or `{{name|fallback}}`.
 *
 * An unknown variable renders as its fallback, or nothing at all — a template
 * should never leak `{{author}}` into a note just because the page had no author.
 */
const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*(?:\|([^}]*))?\}\}/g;

/** The names a template references, so callers know what is worth fetching. */
export const usedVariables = (template: string): string[] => {
	const names = new Set<string>();
	for (const match of template.matchAll(PLACEHOLDER)) {
		const name = match[1];
		if (name) {
			names.add(name);
		}
	}
	return [...names];
};

/**
 * Fill `{{name}}` / `{{name|fallback}}` in a single string.
 *
 * An unknown variable renders as its fallback, or nothing at all — a template
 * should never leak `{{author}}` into a note just because the page had no author.
 */
const fill = (text: string, variables: TemplateVariables): string =>
	text.replace(PLACEHOLDER, (_match, name: string, fallback?: string) => {
		const value = variables[name];
		return value !== undefined && value.length > 0 ? value : (fallback ?? "");
	});

/**
 * Fill a template. Runs of three or more newlines collapse to one blank line, so a
 * template whose optional sections all came back empty does not leave gaps.
 */
export const renderTemplate = (template: string, variables: TemplateVariables): string =>
	fill(template, variables).replace(/\n{3,}/g, "\n\n").trim();

export interface SplitTemplate {
	/** The YAML between the leading `---` fences, if the template opens with one. */
	readonly yaml?: string;
	readonly body: string;
}

const FRONTMATTER_FENCE = /^\s*---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/**
 * Split a template's optional frontmatter from its body.
 *
 * Pure: the caller parses the YAML (Obsidian's `parseYaml`), so this stays testable.
 */
export const splitFrontmatter = (template: string): SplitTemplate => {
	const match = FRONTMATTER_FENCE.exec(template);
	if (!match) {
		return { body: template };
	}
	const yaml = match[1];
	const body = template.slice(match[0].length);
	return yaml === undefined || yaml.trim().length === 0 ? { body } : { yaml, body };
};

/**
 * Fill every string inside a parsed YAML structure.
 *
 * Substitution runs *after* parsing, so a value containing `:` or a newline cannot
 * break the YAML — the writer serializes the object, not our rendered text.
 */
export const substituteDeep = (value: unknown, variables: TemplateVariables): unknown => {
	if (typeof value === "string") {
		return fill(value, variables);
	}
	if (Array.isArray(value)) {
		return value.map((entry) => substituteDeep(entry, variables));
	}
	if (value !== null && typeof value === "object") {
		const filled: Record<string, unknown> = {};
		for (const [key, entry] of Object.entries(value)) {
			filled[key] = substituteDeep(entry, variables);
		}
		return filled;
	}
	return value;
};

/**
 * The default note body: the clipped note this plugin wrote before templates, made
 * editable. `{{notes}}` and `{{connections}}` are pre-rendered blocks.
 *
 * The body alone — properties keep coming from the plugin's defaults unless a
 * template opens with its own `---` frontmatter block.
 */
export const DEFAULT_TEMPLATE = `# {{title}}

> {{description}}

{{url}}

{{notes}}
{{connections}}`;

/** Variables that need the page fetched and extracted (see `effect/Reader`). */
export const PAGE_VARIABLES = new Set(["content", "author", "published", "image", "domain", "words"]);
