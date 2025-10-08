# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

This is a monorepo for Obsidian-related tools and plugins, using:

- **Package Manager**: Bun (v1.2.0)
- **Build System**: Turbo for orchestrating builds across workspaces
- **Code Quality**: Biome for formatting and linting
- **Testing**: Vitest for unit testing
- **Language**: TypeScript

### Workspace Layout

- `packages/` - Contains packages like the Arc Exporter plugin
- No `apps/` directory exists yet (defined in workspaces but not created)

## Common Commands

### Development (from root)
```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Type check all packages
bun run check-types

# Format code (uses tabs for indentation)
bun run format

# Lint and fix code
bun run lint

# Run tests across all packages
bun run test
```

### Plugin Development (in packages/arc-exporter)
```bash
# Development build with watch mode
bun run dev

# Production build
bun run build

# Type checking (TypeScript)
tsc -noEmit -skipLibCheck

# Bump version and update files
bun run version
```

## Plugin Development

The Arc Exporter plugin demonstrates typical Obsidian plugin structure:

- **Entry Point**: `src/main.ts` → compiled to `main.js` via esbuild
- **Build Config**: `esbuild.config.mjs` handles bundling
- **Manifest**: `manifest.json` defines plugin metadata
- **Versioning**: `versions.json` tracks compatibility with Obsidian versions
- **Testing**: Vitest configuration in `vitest.config.ts`

### Plugin Files Structure
- `src/` - TypeScript source code
- `dist/` - Compiled JavaScript output
- `styles.css` - Plugin styles
- `manifest.json` - Plugin metadata for Obsidian
- `versions.json` - Version compatibility mapping

## Code Style

- **Indentation**: Tabs (configured in biome.json)
- **Quotes**: Double quotes for JavaScript/TypeScript
- **Import Organization**: Enabled (automatic import sorting)
- **Line Endings**: LF (implied by standard tooling)

## Build System Details

### Turbo Configuration
- `build` task outputs to `dist/**`
- `check-types` runs with dependency graph
- `dev` is persistent with caching disabled

### TypeScript Configuration
- Target: ES6
- Module: ESNext
- Strict null checks enabled
- DOM library included
- Vitest import meta types supported

## Plugin Installation & Testing

To test the Arc Exporter plugin:
1. Run `bun run dev` in `packages/arc-exporter`
2. Copy generated files to `.obsidian/plugins/arc-exporter/`
3. Enable plugin in Obsidian settings

## Testing

Tests are configured to include source files from `src/**/*.{js,ts}` and use Vitest as the test runner.