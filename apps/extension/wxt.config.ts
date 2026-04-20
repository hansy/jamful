import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "wxt";

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
    permissions: ["storage", "identity", "tabs", "alarms"],
    host_permissions: [
      "http://127.0.0.1:8787/*",
      "http://localhost:8787/*",
      ...allowlistHosts,
    ],
  }),
  vite: () => ({
    server: { hmr: false, fs: { allow: [repoRoot] } },
  }),
});
