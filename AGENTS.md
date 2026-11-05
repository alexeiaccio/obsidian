# Clipper — agent notes

An Obsidian plugin for AT Protocol, forked from
[treethought/obsidian-atmosphere](https://github.com/treethought/obsidian-atmosphere)
(MIT) and maintained here. Bookmarks (Semble, margin.at, community bookmarks,
GitHub and Tangled stars, Arc tabs), standard.site publishing, a source reader,
and canvas lenses.

## Build

```bash
pnpm install       # @eoa/* comes from npm.accio.blue, scoped in .npmrc
pnpm build         # tsc -noEmit, then vp pack → ./main.js
pnpm dev           # vp pack --watch
pnpm test          # vp test --run
```

`vp pack` (vite-plus, `vite.config.ts`) emits a single CommonJS `main.js` into the
repo root: Obsidian loads only that file, so every runtime dependency is bundled
and only `obsidian`, Electron and node builtins stay external. `main.js` is
gitignored; it is a build artifact, not source.

To try it in a vault, copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/obsidian-clipper/` and toggle the plugin in
**Settings → Community plugins**. Obsidian keeps the loaded module in memory, so
a new `main.js` needs that toggle.

## Layout

- `src/main.ts` — plugin entry: settings layer, views, ribbon icons, commands.
- `src/effect/` — the Effect-native core: `Plugin`/`Editor`/`MarkdownView` services,
  `EffectPlugin` base (a scoped `run()`), settings as a `SubscriptionRef`, vault,
  canvas, reader, OAuth, app password, XRPC transport, identity, templates.
- `src/lib/` — the Promise seam the Obsidian-facing UI calls, plus atproto
  bookmarks/standard.site/markdown helpers and `http.ts` (`requestUrl`-based HTTP).
- `src/sources/` — one module per bookmark source, behind `DataSource`
  (`src/sources/types.ts`).
- `src/lens/` — canvas commands: mean-based grouping (Jev), connections, the
  tldraw map queue. `layout.ts` is pure and tested.
- `src/views/`, `src/components/`, `src/commands/` — Obsidian UI.
- `src/lexicons/` — generated record types; `lexicons/` holds their source JSON
  (`lex.config.js`, `@atcute/lex-cli`). Regenerate, do not hand-edit.
- `src/effect/{Plugin,Settings,Vault,Canvas,Patch}.ts` are ports of
  `tim-smart/effect-obsidian` to Effect v4.

## Conventions

- Effect v4 (`4.1.1`). `Context.Service` (no `Context.Tag`), `Effect.fn` for
  exported effectful functions, `Schema.TaggedError` for errors, `.pipe` chaining,
  `Effect.catch`/`catchTag` (no `catchAll`).
- Tabs, single quotes in `.js` configs, the repo's own style in `.ts` (not the
  monorepo's oxlint/oxfmt rules — this fork keeps upstream formatting).
- Every network call goes through `src/lib/http.ts`'s `obsidianFetch`
  (`requestUrl`): the renderer's `fetch` is CORS-bound and reports blocked
  responses as a bare "network error". The AI client gets `obsidianFetch` the
  same way.
- Repository reads go to `bsky.social` before the account's PDS is considered;
  writes go to the PDS, because they need the signature.
- `obsidian` is a runtime type package only: everything else must be bundled.

## Checks before claiming a change works

`pnpm build` (tsc + pack) and `pnpm test`. A behaviour that only shows in a
running vault (login, canvas drawing, reader) has to be seen there — the unit
tests do not cover Obsidian's API.
