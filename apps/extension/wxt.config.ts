import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";
import { loadEnv } from "vite";
import { apiHostPermissionPattern, normalizeApiBase } from "./lib/api-base";

const extensionRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(extensionRoot, "..", "..");

function loadApiBase(mode: string): string {
  const env = loadEnv(mode, extensionRoot, ["WXT_"]);
  return normalizeApiBase(env.WXT_API_BASE_URL);
}

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
  manifest: (env) => {
    const apiBase = loadApiBase(env.mode);
    return {
      name: "Jamful",
      description: "See when friends are playing web games.",
      action: {
        default_icon: {
          "16": "icon/16.png",
          "24": "icon/24.png",
          "32": "icon/32.png",
        },
      },
      icons: {
        "16": "icon/16.png",
        "24": "icon/24.png",
        "32": "icon/32.png",
        "48": "icon/48.png",
        "96": "icon/96.png",
        "128": "icon/128.png",
      },
      permissions: ["storage", "identity", "tabs", "alarms"],
      host_permissions: [apiHostPermissionPattern(apiBase)],
    };
  },
  vite: () => ({
    plugins: [tailwindcss()],
    server: { hmr: false, fs: { allow: [repoRoot] } },
  }),
});
