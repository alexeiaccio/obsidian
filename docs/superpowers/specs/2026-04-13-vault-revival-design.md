# Vault Revival — Design Spec

## Context

A 4-year-old Obsidian vault (565 markdown files) has been dormant since mid-2025. The vault is a developer's "link garden" — web bookmarks collected via Obsidian Web Clipper into daily notes, with wikilinks connecting to 124 tag index pages. Automated git backups still run but content creation stopped. The goal is full revival: clean up legacy cruft, build automated sync pipelines, and create an AI-powered daily processing workflow.

Two existing Obsidian plugins (`arc-exporter` and `github-stars-exporter`) in `~/github/obsidian` will be replaced with standalone CLI scripts to remove plugin overhead.

## Vault Structure (Target)

```
Daily/      — daily notes (web clipper journal, Dec 2024–present)
Links/      — all bookmarks from ALL sources (flat, source in frontmatter)
Notes/      — long-form reference notes (9 files, high quality)
Tags/       — tag index pages (124 files, kept as-is)
Times/      — markwhen timelines
```

Removed: `Weekly/` (9 abandoned 2023 files), `Arc Exports/` (merged into `Links/`).

### Frontmatter Convention (Links/)

```yaml
---
source: arc | github | tangled | semble | margin | daily
url: https://...
tags: [React, TypeScript]
created: 2026-04-13
---
```

The `source` field enables filtering/grouping via Obsidian Bases or Dataview queries.

## Components

### 1. Existing Plugin Improvements → CLI Scripts

The two Obsidian plugins are replaced with standalone TypeScript CLI scripts. Parsing/API logic is extracted, plugin boilerplate is removed.

#### 1a. `sync-arc.ts`

**Reuses:** `src/arc/parser.ts` (Arc JSON parsing logic from arc-exporter)

**Behavior:**
- Reads Arc's `StorableSidebar.json` (macOS `~/Library/Application Support/Arc/`)
- Presents available spaces, user selects which to export (CLI prompt or config)
- Writes markdown to `Links/` with frontmatter (`source: arc`, `export_date`, URL)
- Archive mode: after export, moves processed items to Archive section or marks as exported

**Config:** `config.ts` — Arc JSON path, vault Links/ path, archive behavior

#### 1b. `sync-github-stars.ts`

**Reuses:** `src/github/api.ts` and `src/github/types.ts` (GitHub API client from github-stars-exporter)

**Behavior:**
- GitHub API with token auth, pagination (100/page)
- **Incremental sync:** only fetch stars newer than `lastSyncTimestamp` (stored in config/state file)
- Writes repo notes to `Links/` with template (name, owner, description, stars, language, URL, README if desired)
- Generates language-grouped index file

**Fixes from old plugin:**
- Remove `.env` from git, add to `.gitignore`
- Remove unused `defuddle` dependency
- Remove inline tests, create proper `*.test.ts` files

#### 1c. `sync-tangled-stars.ts` (new)

**Behavior:**
- Fetch starred repos from Tangled (ATProto-based) via their API
- Same output format as GitHub stars for consistency
- Writes to `Links/` with `source: tangled`

#### 1d. `sync-semble-margin.ts` (new)

**Behavior:**
- Fetch bookmarks via standard API (RSS/JSON)
- **Bidirectional sync:** pull new bookmarks to vault, push vault bookmarks out
- Writes to `Links/` with `source: semble` or `source: margin`
- Conflict resolution: last-write-wins with timestamp comparison

#### 1e. Shared Utilities

**`vault.ts`** — Write markdown files, manage frontmatter (read/write/merge YAML), resolve paths, handle filename collisions (append `(1)`, `(2)`).

**`config.ts`** — Centralized config: vault path, API tokens, sync intervals, output settings.

**`arc-parser.ts`** — Extracted from arc-exporter's `src/arc/parser.ts`. Parses Arc's `StorableSidebar.json`, extracts spaces and pinned items.

**`github-api.ts`** — Extracted from github-stars-exporter's `src/github/api.ts`. GitHub API client with pagination, token auth, rate limiting.

### 2. Daily Processing — OpenCode Skill

An OpenCode skill that converts daily note extracts into enriched Link pages using LLM.

**Invocation:** User says "process today's daily notes" (or specifies a date range).

**Workflow:**
1. Read `Daily/YYYY-MM-DD.md`
2. For each link entry (lines matching `- [Title](URL) – description`):
   - Fetch URL content (or use the clipped excerpt)
   - Summarize with OpenCode zen LLM
   - Extract/infers tags from content
   - Create `Links/<Title>.md` with enriched frontmatter and summary
   - Add `[[wikilinks]]` to relevant `Tags/` pages
3. Present results for review before writing files

**Input example:**
```markdown
- [React Server Components](https://react.dev/blog/2024/...) – new RSC patterns
```

**Output example** (`Links/React Server Components.md`):
```yaml
---
source: daily
url: https://react.dev/blog/2024/...
tags: [React, ServerComponents, RSC]
created: 2024-12-27
---
# React Server Components

Summary of the article...

## Key Points
- Server components reduce client JS bundle
- ...
```

### 3. Vault Cleanup (One-Time)

1. **Delete `Weekly/`** — 9 abandoned 2023 weeknotes
2. **Merge `Arc Exports/` into `Links/`** — move 6 files, add `source: arc` frontmatter
3. **Audit `Links/`** — 385 legacy files. Run daily processing skill to enrich with summaries and cross-links. Remove dead/outdated URLs.
4. **Delete `Tags/Untitled.md`** — empty stub
5. **Clean `.gitignore`** — add `.env`, `.smtcmp_*` files
6. **Remove dead plugin folders** from `.obsidian/community-plugins/` (github-stars-exporter, obsidian-image-toolkit, obsidian-importer)

### 4. Project Structure

```
~/github/obsidian/
├── scripts/
│   ├── sync-arc.ts
│   ├── sync-github-stars.ts
│   ├── sync-tangled-stars.ts
│   ├── sync-semble-margin.ts
│   ├── vault.ts              # shared vault utils
│   └── config.ts             # paths, tokens, settings
├── skills/
│   └── process-daily/        # OpenCode skill
├── src/
│   ├── arc-parser.ts         # extracted from old plugin
│   └── github-api.ts         # extracted from old plugin
├── tests/
└── package.json
```

Old `packages/` directory (two plugin packages) is removed.

## Implementation Order

1. **Vault cleanup** — delete Weekly/, merge Arc Exports/, fix .gitignore, remove dead plugins
2. **Extract & build CLI scripts** — vault.ts, config.ts, arc-parser.ts, github-api.ts, then sync scripts
3. **Fix security** — remove .env from git tracking
4. **Build daily processing skill** — OpenCode skill for link enrichment
5. **Audit Links/** — run skill against 385 legacy files
6. **New sync scripts** — Tangled, Semble/Margin

## Open Questions

- Semble/Margin API details — need to confirm exact endpoints and auth
- Tangled API availability — ATProto-based, may need to check docs
- Archive mode for Arc — what happens to tabs after export? Clear pins? Move to archive space?
