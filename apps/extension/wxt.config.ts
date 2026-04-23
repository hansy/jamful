import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";
import { loadEnv } from "vite";
import { apiHostPermissionPattern, normalizeApiBase } from "./lib/api-base";

const extensionRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(extensionRoot, "..", "..");
const registryPath = join(repoRoot, "data/registry.v1.json");

function loadRegistryGames(): { id: string; url: string }[] {
  if (!existsSync(registryPath)) {
    throw new Error(
      `Missing ${registryPath}. Generate it with: bun run registry (from repo root)`,
    );
  }
  const raw = readFileSync(registryPath, "utf-8");
  const parsed = JSON.parse(raw) as { games?: { id: string; url: string }[] };
  return Array.isArray(parsed.games) ? parsed.games : [];
}

function hostPermissionPatterns(games: { url: string }[]): string[] {
  const origins = new Set<string>();
  for (const g of games) {
    const trimmed = g.url.trim();
    if (!trimmed) continue;
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      const u = new URL(withScheme);
      origins.add(`${u.protocol}//${u.host}/*`);
    } catch {
      /* skip bad row */
    }
  }
  return [...origins].sort();
}

const allowlistHosts = hostPermissionPatterns(loadRegistryGames());

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
      permissions: ["storage", "identity", "tabs", "alarms"],
      host_permissions: [...new Set([apiHostPermissionPattern(apiBase), ...allowlistHosts])],
    };
  },
  vite: () => ({
    plugins: [tailwindcss()],
    server: { hmr: false, fs: { allow: [repoRoot] } },
  }),
});
