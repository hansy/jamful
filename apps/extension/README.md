# Jamful extension

## Local API

From the repo root, start the Worker API with:

```bash
bun run dev:worker
```

This now bootstraps local Worker dev automatically: it creates `apps/worker/.env.local`
from `apps/worker/.env.example` if needed, fills in local-only defaults for
`JWT_SECRET` and `X_REFRESH_TOKEN_ENC_KEY`, and applies local D1 migrations before
starting `wrangler dev` through Portless at **`https://api.jamful.localhost`**. You
still need to set `X_CLIENT_ID` in `apps/worker/.env.local`, and `X_CLIENT_SECRET`
if your X app requires it.

## Load unpacked in Chrome (dev)

1. Optional: override the Jamful API URL for the extension build:

   ```bash
   cp apps/extension/.env.example apps/extension/.env.local
   ```

   If no env file is present, the extension uses the local-dev default `https://api.jamful.localhost`.

2. From the repo root (or `apps/extension`), start the dev build:

   ```bash
   bun run dev
   ```

   Leave this running. It writes the extension to **`apps/extension/.output/chrome-mv3-dev`** (path relative to the monorepo root).

3. Open **Google Chrome**.

4. Go to **`chrome://extensions`**.

5. Turn on **Developer mode** (top right).

6. Click **Load unpacked**.

7. Choose this folder (use the real path on your machine):

   **`/Users/hansy/projects/jamful/apps/extension/.output/chrome-mv3-dev`**

   On your machine, replace the prefix with wherever you cloned the repo; the important part is **`.output/chrome-mv3-dev`** inside **`apps/extension`**.

8. After you change extension code and WXT rebuilds, open **`chrome://extensions`** again and click **Reload** on the Jamful card.

Production builds use **`bun run build`** and output **`apps/extension/.output/chrome-mv3`** (no `-dev`).

Chrome Web Store upload zips can be built from the repo root with:

```bash
WXT_API_BASE_URL=https://api.jamful.social bun run zip:extension
```

Firefox Add-ons upload zips can be built with:

```bash
WXT_API_BASE_URL=https://api.jamful.social bun run zip:extension:firefox
```

WXT can also build the Safari web extension files:

```bash
WXT_API_BASE_URL=https://api.jamful.social bun run build:extension:safari
```

Safari still requires an Xcode Safari Web Extension app wrapper and App Store
Connect submission. The WXT output is the web extension source used by that
Apple packaging flow, not the final App Store upload.

**Vite:** this package pins **`vite@^6.3.4`** so dev uses Vite 6.

## Chrome Web Store assets

Store copy lives in `apps/extension/store/listing.json`, with product-level
strings shared from `packages/shared/src/index.ts`. Brand and store images are
generated from the same source artwork:

```bash
bun run assets:brand
```

That command refreshes the extension icons in `apps/extension/public/icon`, the
website favicon and social image in `apps/website/public`, and Chrome Store
draft assets in `apps/extension/store`.

## API base URL

Development defaults to `https://api.jamful.localhost`. To point dev at another API, create `apps/extension/.env.local` and set:

```bash
WXT_API_BASE_URL=https://api.jamful.social
```

Restart the WXT dev/build process after changing this value, then reload the unpacked extension in Chrome. The configured API origin is also added to `host_permissions` during manifest generation.

If you later add a local website app outside this extension workspace, use the same hostname pattern there too, for example `portless website.jamful <site-dev-command>`.

## Production builds

Production builds now fail closed unless `WXT_API_BASE_URL` is explicitly set to a non-local `https://` origin.

Use one of these paths:

```bash
cp apps/extension/.env.production.example apps/extension/.env.production
```

Then set:

```bash
WXT_API_BASE_URL=https://api.jamful.social
```

Or inject it directly in CI:

```bash
WXT_API_BASE_URL=https://api.jamful.social bun run build:extension
```

`http://`, `localhost`, `127.0.0.1`, and `*.localhost` are rejected for production builds.

## Background feed and toolbar flow

When signed in, the popup reads friend activity from a background-owned cache in extension storage. The background service worker is the only code path that calls `GET /feed`; it writes the full feed to `popupFeedCache`, stores the current online-friends count, and redraws the toolbar icon/title from that count.

The background refreshes this cache on startup, after auth changes, and on a 60-second `alarms` timer. The popup also requests a refresh on open and every 60 seconds while mounted, but the background dedupes in-flight refreshes and skips work while the cache is still fresh. This keeps one shared `/feed` refresh path for both the popup UI and the toolbar state.

Jamful does not currently use the browser notifications API or Chrome badge text. The only user-facing "notification" surface is the toolbar icon/title reflecting the latest online-friend count.

## Extension permissions

Current manifest permissions and why they exist:

- `storage`: stores auth tokens, popup feed cache, and self-presence state.
- `identity`: used for the X OAuth PKCE redirect flow via `browser.identity`.
- `tabs`: reads the active tab URL and listens for tab activation/update changes so presence can be detected from the current page.
- `alarms`: wakes the background service worker for the 60-second feed refresh loop and the 60-second self-presence heartbeat loop.
- `host_permissions` for the API origin only: allows the extension to call the Jamful worker API with `fetch`.
