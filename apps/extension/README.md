# Jamful extension

## Local API

From the repo root, start the Worker API with:

```bash
bun run dev:worker
```

This now bootstraps local Worker dev automatically: it creates `apps/worker/.env.local`
from `apps/worker/.env.example` if needed, fills in local-only defaults for
`JWT_SECRET` and `X_REFRESH_TOKEN_ENC_KEY`, and applies local D1 migrations before
starting `wrangler dev`. You still need to set `X_CLIENT_ID` in `apps/worker/.env.local`,
and `X_CLIENT_SECRET` if your X app requires it.

## Load unpacked in Chrome (dev)

1. Optional: override the Jamful API URL for the extension build:

   ```bash
   cp apps/extension/.env.example apps/extension/.env.local
   ```

   If no env file is present, the extension uses the committed local-dev default `http://127.0.0.1:8787`. Set `WXT_API_BASE_URL` only when you want a deployed worker URL.

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

**Vite:** this package pins **`vite@^6.3.4`** so dev uses Vite 6.

## API base URL

The extension uses `http://127.0.0.1:8787` by default. To point it at a deployed worker, create `apps/extension/.env.local` and set:

```bash
WXT_API_BASE_URL=https://your-worker.example.com
```

Restart the WXT dev/build process after changing this value, then reload the unpacked extension in Chrome. The configured API origin is also added to `host_permissions` during manifest generation.

## Authenticated popup data flow

When signed in, the popup reads friend activity from a background-owned cache in extension storage. The background service worker is the only code path that calls `GET /feed`; it updates the toolbar badge count and writes the full feed to `popupFeedCache`.

The popup requests a refresh from the background on open and every 60 seconds while mounted, but the background dedupes in-flight refreshes and skips refreshes while the cache is still fresh. This avoids separate `/feed` polling loops for the badge and popup UI.
