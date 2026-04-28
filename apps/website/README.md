# Jamful Website

TanStack Start site for the Jamful homepage, privacy policy, and terms.

## Development

```bash
bun run dev:website
```

The dev server runs through Portless at `https://jamful.localhost`.

## Content and Metadata

- Shared header/footer components live in `src/components`.
- Pages live in `src/routes`.
- Site metadata is set in `src/routes/__root.tsx`.
- Product-level strings come from `packages/shared/src/index.ts`.

The homepage uses a generated PNG for the browser/extension mockup:
`public/extension-preview.png`.

## Generated Assets

Regenerate website brand assets from the repo root:

```bash
bun run assets:brand
```

This updates the favicon, Apple touch icon, homepage extension preview, and
social image. The social image is referenced by Open Graph and Twitter meta
tags.
