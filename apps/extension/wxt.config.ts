import { defineConfig } from "wxt";

/**
 * “Missing field `moduleType`” / `builtin:vite-react-refresh-wrapper` comes from Vite 6’s dev pipeline
 * (Rolldown + React refresh), not from your app code. `@vitejs/plugin-react` 4.x aligns with Vite 6, but
 * the builtin refresh wrapper can still throw in extension popups until upstream fixes land.
 *
 * `server.hmr: false` turns off that HMR path in dev. Reload the unpacked extension after edits.
 * Production `wxt build` is unaffected.
 */
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  vite: () => ({
    server: { hmr: false },
  }),
});
