// scripts/vault.ts
import { readFile, writeFile, mkdir, access, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { config } from "./config";

export type FrontmatterValue = string | number | string[];
export interface Frontmatter {
	[key: string]: FrontmatterValue;
}

export function sanitizeFileName(fileName: string): string {
	return fileName
		.replace(/[<>:"/\\|?*]/g, "-")
		.replace(/\s+/g, " ")
		.trim();
}

export function parseFrontmatter(content: string): {
	frontmatter: Frontmatter;
	body: string;
} {
	if (!content.startsWith("---\n")) {
		return { frontmatter: {}, body: content };
	}

	// Find closing delimiter: look for \n---\n (with body) or \n--- at end (no body)
	let closeIndex = content.indexOf("\n---\n");
	let bodyOffset = 5; // length of \n---\n
	if (closeIndex === -1) {
		if (content.endsWith("\n---")) {
			closeIndex = content.length - 4;
			bodyOffset = 4;
		} else {
			return { frontmatter: {}, body: content };
		}
	}

	const yamlContent = content.slice(4, closeIndex);
	const body = content.slice(closeIndex + bodyOffset);

	const frontmatter: Frontmatter = {};
	const lines = yamlContent.split("\n");
	for (const line of lines) {
		const kvMatch = line.match(/^(\w+):\s*(.+)$/);
		if (kvMatch) {
			const key = kvMatch[1];
			let value: string | string[] | number = kvMatch[2].trim();

			if (value.startsWith("[") && value.endsWith("]")) {
				value = value
					.slice(1, -1)
					.split(",")
					.map((v) => v.trim().replace(/^["']|["']$/g, ""))
					.filter((v) => v.length > 0);
			} else if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			} else if (!Number.isNaN(Number(value)) && value !== "") {
				frontmatter[key] = Number(value);
				continue;
			}

			frontmatter[key] = value;
		}
	}

	return { frontmatter, body };
}

export function stringifyFrontmatter(
	frontmatter: Frontmatter,
	body: string,
): string {
	let yaml = "---\n";
	for (const [key, value] of Object.entries(frontmatter)) {
		if (Array.isArray(value)) {
			if (value.length === 0) {
				yaml += `${key}: []\n`;
			} else {
				yaml += `${key}: [${value.map((v) => `"${v}"`).join(", ")}]\n`;
			}
		} else if (typeof value === "string") {
			yaml += `${key}: "${value}"\n`;
		} else {
			yaml += `${key}: ${value}\n`;
		}
	}
	yaml += `---\n\n${body}`;
	return yaml;
}

export function mergeFrontmatter(
	existing: Frontmatter,
	updates: Frontmatter,
): Frontmatter {
	const merged = { ...existing };
	for (const [key, value] of Object.entries(updates)) {
		if (Array.isArray(value) && Array.isArray(merged[key])) {
			merged[key] = [...new Set([...(merged[key] as string[]), ...value])];
		} else {
			merged[key] = value;
		}
	}
	return merged;
}

export async function ensureDir(dirPath: string): Promise<void> {
	await mkdir(dirPath, { recursive: true });
}

export async function fileExists(filePath: string): Promise<boolean> {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
}

export async function writeFileToVault(
	relativePath: string,
	content: string,
): Promise<string> {
	const fullPath = resolve(config.vaultPath, relativePath);
	await ensureDir(dirname(fullPath));

	if (await fileExists(fullPath)) {
		const existing = await readFile(fullPath, "utf-8");
		const { frontmatter: existingFm, body: existingBody } =
			parseFrontmatter(existing);
		const { frontmatter: newFm, body: newBody } = parseFrontmatter(content);
		const merged = mergeFrontmatter(existingFm, newFm);
		content = stringifyFrontmatter(merged, newBody || existingBody);
	}

	await writeFile(fullPath, content, "utf-8");
	return fullPath;
}

export async function listFiles(dirPath: string): Promise<string[]> {
	const fullPath = resolve(config.vaultPath, dirPath);
	try {
		const entries = await readdir(fullPath, { withFileTypes: true });
		return entries
			.filter((e) => e.isFile() && e.name.endsWith(".md"))
			.map((e) => e.name);
	} catch {
		return [];
	}
}
