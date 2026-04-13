# Vault Revival Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revive an outdated Obsidian vault by replacing two Obsidian plugins with standalone CLI scripts, building vault sync pipelines (Arc, GitHub, Tangled, Semble/Margin), creating an AI-powered daily processing skill, and performing vault cleanup.

**Architecture:** CLI scripts in TypeScript (Bun) for mechanical sync tasks; OpenCode skill for AI-powered daily note processing. Shared vault-writing utilities. Old Obsidian plugin packages are removed.

**Tech Stack:** TypeScript, Bun, Node.js fs/path, GitHub API, OpenCode zen (LLM)

---

## File Structure

```
~/github/obsidian/
├── scripts/
│   ├── config.ts                 # Create — centralized config (vault path, tokens, settings)
│   ├── vault.ts                  # Create — vault read/write utils, frontmatter, file creation
│   ├── sync-arc.ts               # Create — Arc sidebar sync (extracted from packages/arc-exporter)
│   ├── sync-github-stars.ts      # Create — GitHub stars sync (extracted from packages/github-stars-exporter)
│   ├── sync-tangled-stars.ts     # Create — Tangled stars sync (new)
│   └── sync-semble-margin.ts     # Create — Semble/Margin bookmark sync (new)
├── src/
│   ├── arc-parser.ts             # Create — extracted from packages/arc-exporter/src/arc/parser.ts
│   ├── arc-model.ts              # Create — extracted from packages/arc-exporter/src/arc/model.ts
│   └── github-api.ts             # Create — extracted from packages/github-stars-exporter/src/github/api.ts
├── tests/
│   ├── vault.test.ts             # Create
│   ├── arc-parser.test.ts        # Create
│   └── github-api.test.ts        # Create
├── skills/
│   └── enrich-links/
│       └── SKILL.md              # Create — OpenCode skill for LLM enrichment
├── packages/                     # Delete — old plugin packages
├── docs/superpowers/specs/
│   └── 2026-04-13-vault-revival-design.md  # Already exists
└── package.json                  # Modify — update workspaces, add scripts
```

---

## Chunk 1: Project Restructure & Vault Cleanup

### Task 1: Remove old plugin packages and update project config

**Files:**
- Delete: `packages/arc-exporter/` (entire directory)
- Delete: `packages/github-stars-exporter/` (entire directory)
- Modify: `package.json`
- Modify: `AGENTS.md`
- Modify: `.gitignore`

- [ ] **Step 1: Remove .env from git tracking**

```bash
cd ~/github/obsidian
git rm --cached packages/github-stars-exporter/.env
```

- [ ] **Step 2: Update .gitignore**

Add to `.gitignore`:
```
.env
*.env
dist/
```

- [ ] **Step 3: Remove old packages directories**

```bash
rm -rf packages/arc-exporter packages/github-stars-exporter
```

- [ ] **Step 4: Update package.json workspaces**

Remove `"packages/*"` from workspaces array. Add scripts for the new CLI tools:

```json
{
  "workspaces": [],
  "scripts": {
    "sync-arc": "bun run scripts/sync-arc.ts",
    "sync-github": "bun run scripts/sync-github-stars.ts",
    "sync-tangled": "bun run scripts/sync-tangled-stars.ts",
    "sync-semble": "bun run scripts/sync-semble-margin.ts",
    "build": "echo 'no build needed'",
    "check-types": "tsc --noEmit --skipLibCheck",
    "format": "bunx biome format --write",
    "lint": "bunx biome lint --write --unsafe",
    "test": "vitest"
  }
}
```

- [ ] **Step 5: Create new directory structure**

```bash
mkdir -p scripts src tests skills/process-daily
```

- [ ] **Step 6: Update CLAUDE.md**

Replace content to reflect new structure (CLI scripts, not plugins).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: replace obsidian plugins with CLI scripts

- Remove packages/arc-exporter and packages/github-stars-exporter
- Remove .env from git tracking (credential leak)
- Add scripts/, src/, tests/, skills/ directories
- Update package.json workspaces and scripts"
```

### Task 2: Vault cleanup — delete Weekly, merge Arc Exports

**Files:**
- Delete: `~/.../Notes/Weekly/` (9 files)
- Move: `~/.../Notes/Arc Exports/*` → `~/.../Notes/Links/`
- Delete: `~/.../Notes/Tags/Untitled.md`

**Note:** Arc exports and old Links/ files are written with `tags: []`. The enrichment skill (Task 11) processes them later — fetching URLs, adding tags, cross-links, and annotations via LLM.

- [ ] **Step 1: Delete Weekly notes**

```bash
rm -rf ~/Library/Mobile\ Documents/iCloud~md~obsidian/Documents/Notes/Weekly
```

- [ ] **Step 2: Move Arc Exports into Links/ with raw frontmatter**

Move each file from `Arc Exports/` to `Links/`, adding minimal frontmatter (source, url, tags: [], created). No enrichment yet — that happens via the skill. For each file:
1. Read the file
2. Extract URLs from the `### \`title\`` + `- **Link**: url` format
3. For each URL, create a file in `Links/` with:
   ```yaml
   ---
   source: arc
   url: <url>
   tags: []
   created: <today's date>
   ---
   # <title>
   
   From Arc export: <original space name>
   ```
4. Delete original from `Arc Exports/`

- [ ] **Step 3: Delete Tags/Untitled.md**

```bash
rm ~/Library/Mobile\ Documents/iCloud~md~obsidian/Documents/Notes/Tags/Untitled.md
```

- [ ] **Step 4: Remove dead plugin folders from .obsidian**

Check `~/.obsidian/plugins/` for unused plugin directories and remove them.

- [ ] **Step 5: Commit vault changes**

```bash
cd ~/Library/Mobile\ Documents/iCloud~md~obsidian/Documents/Notes
git add -A
git commit -m "chore: vault cleanup — delete Weekly, move Arc Exports to Links, remove Untitled"
```

After this step, all files in `Links/` (both old 385 files and newly moved Arc exports) have `tags: []` and await LLM enrichment.

---

## Chunk 2: Core Utilities

### Task 3: Create config.ts

**Files:**
- Create: `~/github/obsidian/scripts/config.ts`

- [ ] **Step 1: Write config module**

```typescript
import { homedir } from "node:os";
import { resolve } from "node:path";

export const config = {
	vaultPath: resolve(
		homedir(),
		"Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes",
	),
	linksPath: "Links",
	arcJsonPath: resolve(
		homedir(),
		"Library/Application Support/Arc/StorableSidebar.json",
	),
	githubToken: process.env.GITHUB_TOKEN || "",
	tangledApiBase: "https://tangled.sh/api", // adjust when docs available
	sembleApiBase: "https://semble.sh/api", // adjust when docs available
	marginApiBase: "https://margin.com/api", // adjust when docs available
	stateFile: resolve(
		homedir(),
		"Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes/.sync-state.json",
	),
};

export interface SyncState {
	lastGithubSync: number;
	lastTangledSync: number;
	lastSembleSync: number;
	lastMarginSync: number;
	lastArcSync: number;
}

export function loadState(): SyncState {
	try {
		const data = require("node:fs").readFileSync(config.stateFile, "utf-8");
		return JSON.parse(data);
	} catch {
		return {
			lastGithubSync: 0,
			lastTangledSync: 0,
			lastSembleSync: 0,
			lastMarginSync: 0,
			lastArcSync: 0,
		};
	}
}

export function saveState(state: SyncState): void {
	require("node:fs").writeFileSync(
		config.stateFile,
		JSON.stringify(state, null, 2),
	);
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/config.ts
git commit -m "feat: add centralized config and sync state management"
```

### Task 4: Create vault.ts — shared vault utilities

**Files:**
- Create: `~/github/obsidian/scripts/vault.ts`
- Test: `~/github/obsidian/tests/vault.test.ts`

- [ ] **Step 1: Write failing test for sanitizeFileName**

```typescript
// tests/vault.test.ts
import { describe, expect, test } from "vitest";
import { sanitizeFileName } from "../scripts/vault";

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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/github/obsidian && bun run test tests/vault.test.ts
```

Expected: FAIL — `sanitizeFileName` not found

- [ ] **Step 3: Write vault.ts with sanitizeFileName and core utilities**

```typescript
// scripts/vault.ts
import { readFile, writeFile, mkdir, access, readdir, stat } from "node:fs/promises";
import { resolve, dirname, basename } from "node:path";
import { config } from "./config";

export function sanitizeFileName(fileName: string): string {
	return fileName
		.replace(/[<>:"/\\|?*]/g, "-")
		.replace(/\s+/g, " ")
		.trim();
}

export interface Frontmatter {
	[key: string]: string | number | string[];
}

export function parseFrontmatter(content: string): {
	frontmatter: Frontmatter;
	body: string;
} {
	const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) {
		return { frontmatter: {}, body: content };
	}

	const frontmatter: Frontmatter = {};
	const lines = match[1].split("\n");
	for (const line of lines) {
		const kvMatch = line.match(/^(\w+):\s*(.+)$/);
		if (kvMatch) {
			const key = kvMatch[1];
			let value: string | string[] = kvMatch[2].trim();

			// Parse arrays [a, b, c]
			if (value.startsWith("[") && value.endsWith("]")) {
				value = value
					.slice(1, -1)
					.split(",")
					.map((v) => v.trim().replace(/^["']|["']$/g, ""));
			}
			// Parse quoted strings
			else if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			// Parse numbers
			else if (!isNaN(Number(value))) {
				frontmatter[key] = Number(value);
				continue;
			}

			frontmatter[key] = value;
		}
	}

	return { frontmatter, body: match[2] };
}

export function stringifyFrontmatter(
	frontmatter: Frontmatter,
	body: string,
): string {
	let yaml = "---\n";
	for (const [key, value] of Object.entries(frontmatter)) {
		if (Array.isArray(value)) {
			yaml += `${key}: [${value.map((v) => `"${v}"`).join(", ")}]\n`;
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
			// Merge arrays, deduplicate
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
		// Read existing, merge frontmatter
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd ~/github/obsidian && bun run test tests/vault.test.ts
```

Expected: PASS

- [ ] **Step 5: Add more tests for parseFrontmatter, stringifyFrontmatter, mergeFrontmatter**

```typescript
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
});

describe("mergeFrontmatter", () => {
	test("merges arrays without duplicates", () => {
		const existing = { tags: ["React", "TypeScript"] };
		const updates = { tags: ["TypeScript", "CSS"], source: "arc" };
		const merged = mergeFrontmatter(existing, updates);
		expect(merged.tags).toEqual(["React", "TypeScript", "CSS"]);
		expect(merged.source).toBe("arc");
	});
});
```

- [ ] **Step 6: Run all tests**

```bash
cd ~/github/obsidian && bun run test
```

- [ ] **Step 7: Commit**

```bash
git add scripts/vault.ts tests/vault.test.ts
git commit -m "feat: add shared vault utilities (frontmatter, file creation, sanitization)"
```

---

## Chunk 3: Extract Arc Parser

### Task 5: Create src/arc-parser.ts and src/arc-model.ts

**Files:**
- Create: `~/github/obsidian/src/arc-model.ts`
- Create: `~/github/obsidian/src/arc-parser.ts`
- Test: `~/github/obsidian/tests/arc-parser.test.ts`

- [ ] **Step 1: Copy model types from old plugin**

Copy `packages/arc-exporter/src/arc/model.ts` → `src/arc-model.ts`. No changes needed.

- [ ] **Step 2: Extract parser logic**

Copy `packages/arc-exporter/src/arc/parser.ts` → `src/arc-parser.ts`. Changes:
- Remove unused `filterItems()` function
- Remove unused `validatePath()` function
- Fix imports to use `./arc-model` instead of `./model`
- Improve error handling (throw instead of returning empty)

```typescript
// src/arc-parser.ts
import { createReadStream } from "node:fs";
import { access, constants } from "node:fs/promises";
import { normalize } from "node:path";
import type {
	ArcJSONItem,
	ArcJSONSpace,
	ArcJSONWrapper,
	ArcSidebarItem,
	ArcSidebarModel,
	ArcSidebarSpace,
} from "./arc-model";

export async function parseArcJson(jsonPath: string): Promise<ArcSidebarModel> {
	const stream = createReadStream(jsonPath, { flags: "r", encoding: "utf8" });
	let buffer = "";

	for await (const chunk of stream) {
		buffer += chunk;
	}

	const wrapper: ArcJSONWrapper = JSON.parse(buffer);
	const spaces: ArcSidebarSpace[] = [];

	for (const space of wrapper.sidebar.containers[1].spaces) {
		const spaceJson = space as ArcJSONSpace;
		const pinnedId =
			(spaceJson.containerIDs || [])[
				(spaceJson.containerIDs || []).indexOf("pinned") + 1
			];
		const spaceItemJson = wrapper.sidebar.containers[1].items.find(
			(value) => (value as ArcJSONItem).id === pinnedId,
		) as ArcJSONItem;

		if (spaceItemJson && typeof spaceItemJson === "object") {
			spaceItemJson.title = spaceJson.title;
			spaces.push({
				id: spaceJson.id,
				title: spaceJson.title,
				item: createItem(
					spaceItemJson,
					wrapper.sidebar.containers[1].items as ArcJSONItem[],
					null,
				),
			});
		}
	}

	return { spaces };
}

function createItem(
	itemJson: ArcJSONItem,
	allItemsJson: ArcJSONItem[],
	parentItem: ArcSidebarItem | null,
): ArcSidebarItem {
	let itemTitle = itemJson.title;
	let itemUrl: string | null = null;
	if (itemJson.data?.tab) {
		itemUrl = itemJson.data.tab.savedURL;
		if (!itemTitle) itemTitle = itemJson.data.tab.savedTitle;
	}
	const tag: string = (itemTitle || "").toLowerCase().replace(/\W+/g, "");

	const newItem: ArcSidebarItem = {
		id: itemJson.id,
		parent: parentItem,
		children: [],
		title: itemTitle,
		tag: `${parentItem?.tag || "arc"}-${tag}`,
		url: itemUrl,
	};

	newItem.children = (itemJson.childrenIds || []).reduce(
		(acc: ArcSidebarItem[], childId: string) => {
			const childItemJson = allItemsJson.find((item) => item.id === childId);
			if (childItemJson != null) {
				acc.push(createItem(childItemJson, allItemsJson, newItem));
			}
			return acc;
		},
		[],
	);

	return newItem;
}

export function flattenItems(item: ArcSidebarItem): ArcSidebarItem[] {
	const result: ArcSidebarItem[] = [];
	if (item.url) result.push(item);
	for (const child of item.children) {
		result.push(...flattenItems(child));
	}
	return result;
}
```

- [ ] **Step 3: Write test with sample Arc JSON**

```typescript
// tests/arc-parser.test.ts
import { describe, expect, test, beforeEach } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArcJson, flattenItems } from "../src/arc-parser";

const TEST_DIR = resolve(__dirname, ".test-tmp");

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
						childrenIds: [],
						title: "",
						data: {
							tab: {
								savedTitle: "TypeScript",
								savedURL: "https://typescriptlang.org",
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

test("parseArcJson extracts spaces and items", async () => {
	const result = await parseArcJson(resolve(TEST_DIR, "StorableSidebar.json"));
	expect(result.spaces).toHaveLength(1);
	expect(result.spaces[0].title).toBe("Dev");
	expect(result.spaces[0].item.children).toHaveLength(2);
});

test("flattenItems collects all URL items", async () => {
	const result = await parseArcJson(resolve(TEST_DIR, "StorableSidebar.json"));
	const flat = flattenItems(result.spaces[0].item);
	expect(flat).toHaveLength(2);
	expect(flat[0].url).toBe("https://react.dev");
	expect(flat[1].url).toBe("https://typescriptlang.org");
});
```

- [ ] **Step 4: Run tests**

```bash
cd ~/github/obsidian && bun run test tests/arc-parser.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/arc-model.ts src/arc-parser.ts tests/arc-parser.test.ts
git commit -m "feat: extract arc parser from old plugin, add flattenItems utility"
```

---

## Chunk 4: Extract GitHub API Client

### Task 6: Create src/github-api.ts

**Files:**
- Create: `~/github/obsidian/src/github-api.ts`
- Test: `~/github/obsidian/tests/github-api.test.ts`

- [ ] **Step 1: Extract GitHubClient from old plugin**

Copy logic from `packages/github-stars-exporter/src/github/api.ts`. Changes:
- Remove `localCache()` method (was for dev caching, not needed in CLI)
- Remove `getStarredLists()` method (fragile HTML scraping)
- Remove inline tests (`import.meta.vitest` block)
- Keep: `makeRequest()`, `me()`, `validateToken()`, `getStarredRepositories()`, `getReadmeContent()`, `getRateLimitInfo()`
- Add `since` parameter to `getStarredRepositories()` for incremental sync
- Export types inline or from a types file

```typescript
// src/github-api.ts

const GITHUB_API_BASE = "https://api.github.com";
const DEFAULT_PER_PAGE = 100;

export interface StarredRepository {
	name: string;
	full_name: string;
	description: string | null;
	html_url: string;
	language: string | null;
	stargazers_count: number;
	forks_count: number;
	homepage: string | null;
	topics: string[];
	created_at: string;
	updated_at: string;
	starred_at: string;
	owner: { login: string; type: string };
}

export class GitHubApiError extends Error {
	constructor(
		message: string,
		public status?: number,
	) {
		super(message);
		this.name = "GitHubApiError";
	}
}

export class GitHubClient {
	constructor(private token: string) {}

	private async makeRequest<T>(url: string): Promise<{ data: T; headers: [string, string][] }> {
		const headers: HeadersInit = {
			Accept: "application/vnd.github.v3.star+json",
			"X-GitHub-Api-Version": "2022-11-28",
			"User-Agent": "vault-sync-cli",
		};

		if (this.token) {
			headers.Authorization = `Bearer ${this.token}`;
		}

		const response = await fetch(url, { headers });

		if (!response.ok) {
			throw new GitHubApiError(
				`HTTP ${response.status}: ${response.statusText}`,
				response.status,
			);
		}

		return {
			headers: [...response.headers.entries()],
			data: await response.json(),
		};
	}

	async me(): Promise<{ login: string }> {
		const result = await this.makeRequest<{ login: string }>(`${GITHUB_API_BASE}/user`);
		return result.data;
	}

	async validateToken(): Promise<boolean> {
		try {
			await this.me();
			return true;
		} catch {
			return false;
		}
	}

	async getStarredRepositories(
		maxStars: number = 1000,
		since?: number,
		onProgress?: (fetched: number, total: number) => void,
	): Promise<{ repositories: StarredRepository[]; totalCount: number }> {
		const repositories: StarredRepository[] = [];
		let page = 1;
		let totalCount = 0;

		const firstResponse = await this.makeRequest<StarredRepository[]>(
			`${GITHUB_API_BASE}/user/starred?per_page=1&page=1`,
		);

		const linkHeader = firstResponse.headers.find(([key]) => key === "link")?.[1];
		const match = linkHeader?.match(/page=(\d+)>; rel="last"/);
		if (match) {
			totalCount = Number(match[1]);
		}

		do {
			const url = `${GITHUB_API_BASE}/user/starred?per_page=${Math.min(DEFAULT_PER_PAGE, maxStars)}&page=${page}`;
			const pageData = await this.makeRequest<StarredRepository[]>(url);

			for (const repo of pageData.data) {
				if (since && new Date(repo.starred_at).getTime() < since) {
					return { repositories, totalCount };
				}
				repositories.push(repo);
			}

			if (onProgress) {
				onProgress(repositories.length, totalCount || repositories.length);
			}

			if (repositories.length >= maxStars || pageData.data.length < DEFAULT_PER_PAGE) {
				break;
			}

			page++;
		} while (repositories.length < maxStars);

		return { repositories, totalCount };
	}

	async getReadmeContent(owner: string, repo: string): Promise<string | null> {
		try {
			const readmeData = await this.makeRequest<{ content: string }>(
				`${GITHUB_API_BASE}/repos/${owner}/${repo}/readme`,
			);
			return atob(readmeData.data.content);
		} catch {
			return null;
		}
	}
}
```

- [ ] **Step 2: Write unit test (mock fetch)**

```typescript
// tests/github-api.test.ts
import { describe, expect, test } from "vitest";
import { GitHubClient } from "../src/github-api";

test("GitHubClient constructs with token", () => {
	const client = new GitHubClient("test-token");
	expect(client).toBeDefined();
});

// Integration tests require GITHUB_TOKEN env var
test.skipIf(!process.env.GITHUB_TOKEN)("validateToken returns true for valid token", async () => {
	const client = new GitHubClient(process.env.GITHUB_TOKEN!);
	const valid = await client.validateToken();
	expect(valid).toBe(true);
});
```

- [ ] **Step 3: Run tests**

```bash
cd ~/github/obsidian && bun run test tests/github-api.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/github-api.ts tests/github-api.test.ts
git commit -m "feat: extract GitHub API client with incremental sync support"
```

---

## Chunk 5: Sync Scripts

### Task 7: Create sync-arc.ts

**Files:**
- Create: `~/github/obsidian/scripts/sync-arc.ts`

- [ ] **Step 1: Write sync-arc script**

```typescript
#!/usr/bin/env bun
// scripts/sync-arc.ts
import { resolve } from "node:path";
import { parseArcJson, flattenItems } from "../src/arc-parser";
import { config, loadState, saveState } from "./config";
import { writeFileToVault, sanitizeFileName, stringifyFrontmatter } from "./vault";

interface ArcCliConfig {
	spaces?: string[]; // empty = all spaces
	archiveAfterExport: boolean;
}

async function syncArc(cliConfig: ArcCliConfig = { archiveAfterExport: false }) {
	console.log("Parsing Arc sidebar...");
	const model = await parseArcJson(config.arcJsonPath);

	if (model.spaces.length === 0) {
		console.log("No Arc spaces found. Is Arc running?");
		return;
	}

	const spacesToExport = cliConfig.spaces?.length
		? model.spaces.filter((s) => cliConfig.spaces!.includes(s.title))
		: model.spaces;

	console.log(`Exporting ${spacesToExport.length} space(s)...`);

	let exportedCount = 0;

	for (const space of spacesToExport) {
		const items = flattenItems(space.item);
		if (items.length === 0) continue;

		// Write each item as a separate file in Links/
		// Tags, cross-links, annotations added later by LLM processing skill
		for (const item of flattenItems(space.item)) {
			if (!item.url) continue;
			const fileName = sanitizeFileName(item.title || "untitled") + ".md";
			const content = stringifyFrontmatter(
				{
					source: "arc",
					url: item.url,
					arc_space: space.title,
					tags: [],
					created: new Date().toISOString().split("T")[0],
				},
				`# ${item.title}\n\nSaved from Arc browser space: **${space.title}**\n\n[${item.url}](${item.url})`,
			);

			await writeFileToVault(`Links/${fileName}`, content);
			exportedCount++;
		}
	}

	// Update sync state
	const state = loadState();
	state.lastArcSync = Date.now();
	saveState(state);

	console.log(`Exported ${exportedCount} items from Arc.`);
}

// Run if called directly
if (import.meta.main) {
	syncArc().catch(console.error);
}

export { syncArc };
```

- [ ] **Step 2: Test manually**

```bash
cd ~/github/obsidian && bun run scripts/sync-arc.ts
```

- [ ] **Step 3: Commit**

```bash
git add scripts/sync-arc.ts
git commit -m "feat: add Arc sidebar sync script"
```

### Task 8: Create sync-github-stars.ts

**Files:**
- Create: `~/github/obsidian/scripts/sync-github-stars.ts`

- [ ] **Step 1: Write sync-github-stars script**

```typescript
#!/usr/bin/env bun
// scripts/sync-github-stars.ts
import { GitHubClient } from "../src/github-api";
import { config, loadState, saveState } from "./config";
import { writeFileToVault, sanitizeFileName, stringifyFrontmatter } from "./vault";

async function syncGitHubStars(incremental = true) {
	if (!config.githubToken) {
		console.error("GITHUB_TOKEN environment variable not set");
		process.exit(1);
	}

	const client = new GitHubClient(config.githubToken);
	const state = loadState();
	const since = incremental ? state.lastGithubSync : 0;

	console.log(
		since
			? `Fetching stars since ${new Date(since).toISOString()}...`
			: "Fetching all starred repos...",
	);

	const { repositories, totalCount } = await client.getStarredRepositories(
		1000,
		since || undefined,
		(fetched, total) => {
			process.stdout.write(`\rFetched ${fetched}/${total} repos...`);
		},
	);

	console.log(`\nProcessing ${repositories.length} repositories...`);

	for (const repo of repositories) {
		const fileName = sanitizeFileName(repo.full_name) + ".md";
		// Tags from GitHub topics only; LLM enriches with cross-links and annotations later
		const content = stringifyFrontmatter(
			{
				source: "github",
				url: repo.html_url,
				tags: repo.topics,
				created: repo.starred_at.split("T")[0],
			},
			`# ${repo.full_name}\n\n${repo.description || "No description"}\n\n` +
				`[View on GitHub](${repo.html_url})`,
		);

		await writeFileToVault(`Links/${fileName}`, content);
	}

	state.lastGithubSync = Date.now();
	saveState(state);

	console.log(`Synced ${repositories.length} GitHub stars.`);
}

if (import.meta.main) {
	syncGitHubStars().catch(console.error);
}

export { syncGitHubStars };
```

- [ ] **Step 2: Commit**

```bash
git add scripts/sync-github-stars.ts
git commit -m "feat: add GitHub stars sync script with incremental support"
```

### Task 9: Create sync-tangled-stars.ts

**Files:**
- Create: `~/github/obsidian/scripts/sync-tangled-stars.ts`

- [ ] **Step 1: Write sync-tangled-stars script (stub — API details TBD)**

```typescript
#!/usr/bin/env bun
// scripts/sync-tangled-stars.ts
import { config, loadState, saveState } from "./config";
import { writeFileToVault, sanitizeFileName, stringifyFrontmatter } from "./vault";

interface TangledRepo {
	did: string;
	name: string;
	description?: string;
	url: string;
}

async function syncTangledStars() {
	// TODO: Tangled API docs needed
	// ATProto-based, likely uses app.bsky or custom lexicon
	console.log("Tangled sync: API integration pending.");
	console.log("Update config.tangledApiBase and this function when API docs are available.");
}

if (import.meta.main) {
	syncTangledStars().catch(console.error);
}

export { syncTangledStars };
```

- [ ] **Step 2: Commit**

```bash
git add scripts/sync-tangled-stars.ts
git commit -m "feat: add Tangled stars sync stub (API details pending)"
```

### Task 10: Create sync-semble-margin.ts

**Files:**
- Create: `~/github/obsidian/scripts/sync-semble-margin.ts`

- [ ] **Step 1: Write sync-semble-margin script (stub)**

```typescript
#!/usr/bin/env bun
// scripts/sync-semble-margin.ts
import { config, loadState, saveState } from "./config";
import { writeFileToVault, sanitizeFileName, stringifyFrontmatter } from "./vault";

interface Bookmark {
	url: string;
	title: string;
	description?: string;
	tags?: string[];
	createdAt: string;
}

async function fetchSembleBookmarks(since?: number): Promise<Bookmark[]> {
	// TODO: Semble API integration
	// Standard REST API expected
	console.log("Semble sync: API integration pending.");
	return [];
}

async function fetchMarginBookmarks(since?: number): Promise<Bookmark[]> {
	// TODO: Margin API integration
	console.log("Margin sync: API integration pending.");
	return [];
}

async function syncSembleMargin() {
	const state = loadState();

	const sembleBookmarks = await fetchSembleBookmarks(state.lastSembleSync);
	for (const bookmark of sembleBookmarks) {
		const fileName = sanitizeFileName(bookmark.title) + ".md";
		const content = stringifyFrontmatter(
			{
				source: "semble",
				url: bookmark.url,
				tags: bookmark.tags || [],
				created: bookmark.createdAt.split("T")[0],
			},
			`# ${bookmark.title}\n\n${bookmark.description || ""}\n\n[${bookmark.url}](${bookmark.url})`,
		);
		await writeFileToVault(`Links/${fileName}`, content);
	}

	const marginBookmarks = await fetchMarginBookmarks(state.lastMarginSync);
	for (const bookmark of marginBookmarks) {
		const fileName = sanitizeFileName(bookmark.title) + ".md";
		const content = stringifyFrontmatter(
			{
				source: "margin",
				url: bookmark.url,
				tags: bookmark.tags || [],
				created: bookmark.createdAt.split("T")[0],
			},
			`# ${bookmark.title}\n\n${bookmark.description || ""}\n\n[${bookmark.url}](${bookmark.url})`,
		);
		await writeFileToVault(`Links/${fileName}`, content);
	}

	state.lastSembleSync = Date.now();
	state.lastMarginSync = Date.now();
	saveState(state);

	console.log(`Synced ${sembleBookmarks.length} Semble + ${marginBookmarks.length} Margin bookmarks.`);
}

if (import.meta.main) {
	syncSembleMargin().catch(console.error);
}

export { syncSembleMargin };
```

- [ ] **Step 2: Commit**

```bash
git add scripts/sync-semble-margin.ts
git commit -m "feat: add Semble/Margin bookmark sync stub (API details pending)"
```

---

## Chunk 6: Daily Processing Skill

### Task 11: Create OpenCode skill for vault enrichment

**Files:**
- Create: `~/github/obsidian/skills/enrich-links/SKILL.md`

- [ ] **Step 1: Write skill definition**

```markdown
# Skill: Enrich Links

LLM-powered enrichment of vault link files. Handles tagging, cross-linking, summaries, and annotations for ALL sources (Arc, GitHub, Tangled, Semble/Margin, daily notes).

## When to Use
- User says "enrich links", "process daily notes", or "sync and enrich"
- After running any sync script, to add tags, cross-links, and annotations
- User wants to batch-process existing Links/ files with empty tags

## Workflow

### Mode 1: Process daily notes → Links/
1. Read daily note file(s) from `Daily/YYYY-MM-DD.md`
2. Extract link entries (lines matching `- [Title](URL) – description`)
3. For each link:
   a. Fetch URL content (WebFetch)
   b. Summarize the content
   c. Infer tags matching existing Tags/ pages
   d. Create `Links/<Title>.md` with enriched frontmatter
   e. Add `[[wikilinks]]` to relevant Tags/ pages
4. Present summary for review
5. **After user confirms:** delete processed daily note(s) from `Daily/`

### Mode 2: Enrich existing Links/ files
1. Find files in `Links/` with empty or missing `tags` field
   - This includes old 385 legacy bookmark files (frontmatter-only, no summary)
   - This includes Arc exports moved during vault cleanup
2. For each file:
   a. Read existing content and URL from frontmatter
   b. Fetch URL content if not already summarized
   c. Infer tags, add `[[wikilinks]]` to Tags/ pages
   d. Add short annotation/summary
   e. Update the file in place

## Enrichment Rules
- Tags must match existing `Tags/*.md` filenames when possible
- Add `[[wikilinks]]` to tag pages inline in the body
- Short annotation = 1-2 sentence summary of what the link is about
- Preserve existing frontmatter; only add/update `tags` and body
- Never invent URLs or links that don't exist in the vault

## Frontmatter Format
```yaml
---
source: arc | github | tangled | semble | margin | daily
url: <URL>
tags: [tag1, tag2]
created: YYYY-MM-DD
---
```
```

- [ ] **Step 2: Commit**

```bash
git add skills/enrich-links/SKILL.md
git commit -m "feat: add vault enrichment skill (LLM-powered tags, cross-links, annotations)"
```

---

## Chunk 7: Integration & Polish

### Task 12: Wire everything together, test end-to-end

- [ ] **Step 1: Test sync-arc against real Arc JSON**

```bash
cd ~/github/obsidian && bun run scripts/sync-arc.ts
```

Verify files appear in `~/.../Notes/Links/` with correct frontmatter.

- [ ] **Step 2: Test sync-github-stars (if GITHUB_TOKEN set)**

```bash
cd ~/github/obsidian && GITHUB_TOKEN=xxx bun run scripts/sync-github-stars.ts
```

- [ ] **Step 3: Run full test suite**

```bash
cd ~/github/obsidian && bun run test
```

- [ ] **Step 4: Run type checking and linting**

```bash
cd ~/github/obsidian && bun run check-types && bun run lint && bun run format
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: final integration — tests pass, lint clean"
```

### Task 13: Update AGENTS.md with final project structure

- [ ] **Step 1: Rewrite AGENTS.md for new structure**

Document:
- New directory layout (scripts/, src/, tests/, skills/)
- How to run each sync script
- How to invoke the daily processing skill
- Code style (tabs, double quotes — unchanged from biome config)
- Testing approach

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md for new CLI-based structure"
```

---

## Verification Checklist

- [ ] All tests pass (`bun run test`)
- [ ] Type checking passes (`bun run check-types`)
- [ ] Linting passes (`bun run lint`)
- [ ] `sync-arc.ts` creates files in `Links/` with correct frontmatter
- [ ] `sync-github-stars.ts` supports incremental sync via `lastSyncTimestamp`
- [ ] Vault cleanup complete (no Weekly/, no Arc Exports/, no Untitled.md)
- [ ] `.env` removed from git tracking
- [ ] OpenCode daily processing skill exists and is loadable
