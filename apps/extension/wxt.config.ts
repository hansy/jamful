import { defineConfig } from "wxt";

/**
 * Pin `vite` to 6.x in package.json — Vite 8 + Rolldown can throw `Missing field moduleType` in dev
 * (`builtin:vite-react-refresh-wrapper`) even with HMR off.
 *
 * `server.hmr: false` — reload the unpacked extension in Chrome after edits.
 */
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  react: {
    vite: {
      disableOxcRecommendation: true,
    },
  },
  /** Never auto-open a browser; load unpacked from `.output/chrome-mv3-dev` yourself (see README). */
  webExt: {
    disabled: true,
  },
  manifest: () => ({
    name: "Jamful",
    description: "See when friends are playing web games.",
    permissions: ["storage", "identity"],
    host_permissions: ["http://127.0.0.1:8787/*", "http://localhost:8787/*"],
    optional_host_permissions: ["https://*/*", "http://*/*"],
  }),
  vite: () => ({
    server: { hmr: false },
  }),
});
