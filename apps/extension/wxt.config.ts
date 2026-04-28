import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";
import { loadEnv } from "vite";
import { PRODUCT_METADATA } from "@jamful/shared";
import { apiHostPermissionPattern, normalizeApiBase } from "./lib/api-base";

const extensionRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(extensionRoot, "..", "..");

function loadApiBase(mode: string): string {
  const env = loadEnv(mode, extensionRoot, ["WXT_"]);
  return normalizeApiBase(env.WXT_API_BASE_URL, {
    mode: mode === "production" ? "production" : "development",
  });
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
    const manifest = {
      name: PRODUCT_METADATA.name,
      short_name: PRODUCT_METADATA.shortName,
      description: PRODUCT_METADATA.chromeStoreSummary,
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

    if (env.browser === "firefox") {
      return {
        ...manifest,
        browser_specific_settings: {
          gecko: {
            id: "extension@jamful.social",
            strict_min_version: "140.0",
            data_collection_permissions: {
              required: [
                "personallyIdentifyingInfo",
                "authenticationInfo",
                "browsingActivity",
              ],
            },
          },
          gecko_android: {
            strict_min_version: "142.0",
          },
        },
      };
    }

    return manifest;
  },
  vite: () => ({
    plugins: [tailwindcss()],
    server: { hmr: false, fs: { allow: [repoRoot] } },
  }),
});
