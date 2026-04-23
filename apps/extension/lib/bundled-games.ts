import type { Game } from "@jamful/shared";
import registryPayload from "../../../data/registry.v1.json";

type RegistryFile = {
  games?: Game[];
};

const payload = registryPayload as RegistryFile;

/** Canonical game registry shared with the worker via the bundled JSON payload. */
export const bundledGames: Game[] = Array.isArray(payload.games) ? payload.games : [];

function normalizeGameUrl(raw: string): URL | null {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withScheme);
  } catch {
    return null;
  }
}

/**
 * Longest URL prefix wins so `https://a.com/app` beats `https://a.com` when both match.
 */
export function matchTabUrlToGame(tabUrl: string): Game | null {
  let tab: URL;
  try {
    tab = new URL(tabUrl);
  } catch {
    return null;
  }

  const ranked = bundledGames
    .map((g) => ({ g, base: normalizeGameUrl(g.url) }))
    .filter((row): row is { g: Game; base: URL } => !!row.base)
    .filter(({ base }) => tab.origin === base.origin)
    .map(({ g, base }) => {
      const basePath = (base.pathname || "/").replace(/\/+$/, "") || "/";
      const tabPath = tab.pathname || "/";
      const matches =
        basePath === "/" ? true : tabPath === basePath || tabPath.startsWith(`${basePath}/`);
      return matches ? { g, score: base.href.length } : null;
    })
    .filter((x): x is { g: Game; score: number } => !!x)
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.g ?? null;
}
