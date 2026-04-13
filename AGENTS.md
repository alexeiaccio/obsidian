# Obsidian Vault Sync Tools

## Project Overview

CLI tools for syncing bookmarks from various sources (Arc, GitHub, Tangled, Semble/Margin) into an Obsidian vault. Includes LLM-powered enrichment for tags, cross-links, and annotations.

- **Runtime:** Bun
- **Language:** TypeScript (`"strict": true`)
- **Config:** `scripts/config.ts` (vault path, tokens, settings)

## Directory Structure

```
scripts/
  config.ts              — centralized config (vault path, tokens, settings)
  vault.ts               — vault read/write utils, frontmatter, file creation
  sync-arc.ts            — Arc sidebar sync
  sync-github-stars.ts   — GitHub stars sync (incremental)
  sync-tangled-stars.ts  — Tangled stars sync (stub)
  sync-semble-margin.ts  — Semble/Margin bookmark sync (stub)
src/
  arc-model.ts           — Arc JSON TypeScript interfaces
  arc-parser.ts          — Arc sidebar JSON parser
  github-api.ts          — GitHub API client
tests/
  vault.test.ts          — vault utility tests
  arc-parser.test.ts     — Arc parser tests
  github-api.test.ts     — GitHub API tests
skills/
  enrich-links/
    SKILL.md             — OpenCode skill for LLM enrichment
```

## Running Scripts

```bash
bun run scripts/sync-arc.ts
GITHUB_TOKEN=xxx bun run scripts/sync-github-stars.ts
bun run scripts/sync-tangled-stars.ts
bun run scripts/sync-semble-margin.ts
```

## Enrichment Skill

Invoke via OpenCode skill tool:
```
skill("enrich-links")
```
Enrichment adds tags, cross-links, and annotations to synced files via LLM.

## Common Commands

```bash
bun run test           # Run tests
bun run lint           # Lint and auto-fix
bun run format         # Format code
bun run check-types    # Type check (needs tsconfig)
```

## Architecture

- **Sync scripts are dumb fetchers** — write files with `tags: []`
- **Enrichment** (tags, cross-links, annotations) happens via LLM skill
- **Vault path** configured in `scripts/config.ts`
- **Sync state** tracked in `.sync-state.json` in vault root

## Code Style

- Tabs for indentation
- Double quotes for strings
- Import organization enabled (Biome)
- Run `bun run format` and `bun run lint` before committing

## Testing

- Vitest. Tests in `tests/` directory.
- Run with `bun run test`.
- Mock external API calls; never hit real services in tests.

## Security

- Never commit secrets. Use `.env` files (gitignored).
- Read tokens from environment variables at runtime.
