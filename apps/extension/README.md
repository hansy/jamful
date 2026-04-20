# Jamful extension

## Load unpacked in Chrome (dev)

1. From the repo root (or `apps/extension`), start the dev build:

   ```bash
   bun run dev
   ```

   Leave this running. It writes the extension to **`apps/extension/.output/chrome-mv3-dev`** (path relative to the monorepo root).

2. Open **Google Chrome**.

3. Go to **`chrome://extensions`**.

4. Turn on **Developer mode** (top right).

5. Click **Load unpacked**.

6. Choose this folder (use the real path on your machine):

   **`/Users/hansy/projects/jamful/apps/extension/.output/chrome-mv3-dev`**

   On your machine, replace the prefix with wherever you cloned the repo; the important part is **`.output/chrome-mv3-dev`** inside **`apps/extension`**.

7. After you change extension code and WXT rebuilds, open **`chrome://extensions`** again and click **Reload** on the Jamful card.

Production builds use **`bun run build`** and output **`apps/extension/.output/chrome-mv3`** (no `-dev`).

**Vite:** this package pins **`vite@^6.3.4`** so dev uses Vite 6.
