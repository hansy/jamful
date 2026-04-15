import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

// https://wxt.dev/guide/installation.html
export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  srcDir: ".",
  outDir: "dist",
  manifest: () => ({
    name: "Jamful",
    description: "See when friends are playing web games.",
    permissions: ["storage", "alarms", "tabs", "notifications", "identity"],
    host_permissions: ["http://127.0.0.1:8787/*", "http://localhost:8787/*"],
    optional_host_permissions: ["https://*/*", "http://*/*"],
  }),
  vite: () => ({
    // @tailwindcss/vite types target Vite 8; WXT uses Vite 6 — runtime-compatible, types differ
    plugins: [...tailwindcss()] as any,
    // Vite 6 React refresh can log "Missing field `moduleType`" (builtin:vite-react-refresh-wrapper) for
    // WXT popup entrypoints. Disabling dev-server HMR avoids that path; rebuild/reload the unpacked ext after edits.
    server: { hmr: false },
  }),
});
