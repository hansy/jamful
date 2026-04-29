# Jamful

Jamful is a browser extension and website for seeing when people are playing
supported Vibe Jam web games.

## Apps

- `apps/website`: TanStack Start marketing/legal site at `jamful.localhost`.
- `apps/extension`: WXT Chrome extension.
- `apps/worker`: Cloudflare Worker API.

## Common Commands

```bash
bun install
bun run dev:website
bun run dev:worker
bun run dev:extension
bun run typecheck
```

The website dev script uses Portless, so the local site is available at
`https://jamful.localhost`.

## Shared Data

- Product copy and metadata live in `packages/shared/src/index.ts`.
- The canonical supported game list is `data/games.json`.
- After editing `data/games.json`, run:

```bash
bun run registry
```

This regenerates `data/registry.v1.json`, which is bundled by the extension and
used by the worker.

## Brand and Store Assets

Homepage graphics, favicons, extension icons, social images, and Chrome Store
draft images are generated from:

```bash
bun run assets:brand
```

Chrome Store listing copy lives in `apps/extension/store/listing.json`. To build
the upload zip:

```bash
WXT_API_BASE_URL=https://api.jamful.social bun run zip:extension
```

Before uploading a new Chrome Store package, bump the extension version:

```bash
bun run version:extension
```

This regenerates `data/registry.v1.json`, checks for extension-shipped changes
including bundled game list changes, and bumps `apps/extension/package.json`.
The default bump is patch. Use `-- --minor`, `-- --major`, or `-- --force` when
needed:

```bash
bun run version:extension -- --minor
bun run version:extension -- --force
```

To bump and build the Chrome upload zip in one command:

```bash
bun run release:extension
```

Firefox uses a separate package:

```bash
WXT_API_BASE_URL=https://api.jamful.social bun run zip:extension:firefox
```

Safari can be built with WXT, but publishing requires Apple's Xcode Safari Web
Extension wrapper and App Store Connect flow:

```bash
WXT_API_BASE_URL=https://api.jamful.social bun run build:extension:safari
```
