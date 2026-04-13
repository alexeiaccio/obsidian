# Obsidian vault scripts

## Project overview

- **Runtime:** Bun (use `bun run <script>` to execute).
- **Language:** TypeScript (`"strict": true`).
- **Purpose:** CLI scripts that sync external data (GitHub stars, Arc browser tabs, Tangled, Semble) into the Obsidian vault.

## Directory layout

```
scripts/           # Executable entry points (one per sync source)
src/               # Shared modules, types, utilities
tests/             # Vitest test files
skills/            # Agent skill definitions
  process-daily/   # Daily note processing skill
```

## Tooling

| Tool | Role | Commands |
|------|------|----------|
| **Bun** | Runtime + package manager | `bun install`, `bun run <script>` |
| **Biome** | Formatter + linter | `bunx biome format --write`, `bunx biome lint --write --unsafe` |
| **Vitest** | Test runner | `bun test` or `vitest` |
| **TypeScript** | Type checking | `bun run check-types` |

## Scripts

| Script | Description |
|--------|-------------|
| `sync-arc` | Sync Arc browser tabs |
| `sync-github` | Sync GitHub starred repos |
| `sync-tangled` | Sync Tangled data |
| `sync-semble` | Sync Semble margin notes |

## Code style

- **Indentation:** Tabs (configured in `biome.json`).
- **Quotes:** Double quotes.
- **Formatting:** Enforced by Biome — run `bun run format` before committing.
- **Linting:** Enforced by Biome — run `bun run lint` before committing.
- Prefer `async/await` over promise chains.
- Handle errors gracefully; don't swallow exceptions silently.
- Keep each script focused on a single sync source.
- Shared logic goes in `src/`, not duplicated across scripts.

## Adding a new sync script

1. Create `scripts/sync-<name>.ts` as the entry point.
2. Add shared utilities/types to `src/`.
3. Add a `"sync-<name>"` entry to `scripts` in `package.json`.
4. Write tests in `tests/sync-<name>.test.ts`.
5. Run `bun run check-types` and `bun run test` before committing.

## Testing

- Tests live in `tests/` and use Vitest.
- Run all tests: `bun run test` or `vitest`.
- Run a single file: `vitest tests/<file>.test.ts`.
- Mock external API calls; never hit real services in tests.

## Security

- Never commit secrets (API keys, tokens). Use `.env` files (gitignored).
- Read secrets from environment variables at runtime.
- Don't log sensitive values.

## Agent do/don't

**Do**
- Run `bun run check-types` and `bun run test` before claiming work is done.
- Follow the existing code style (tabs, double quotes).
- Keep scripts small and focused.

**Don't**
- Introduce dependencies without checking if Bun's built-ins suffice.
- Skip error handling in async code.
- Commit without running `bun run format`.
