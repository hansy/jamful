import type { Game } from "@jamful/shared";
import type { RegistryPayload } from "./types";

const REGISTRY_KEY = "registry:v1";

export async function getRegistryGames(env: Env): Promise<Game[]> {
  const raw = await env.JAMFUL_KV.get(REGISTRY_KEY);
  if (!raw) return [];
  try {
    const p = JSON.parse(raw) as RegistryPayload;
    return p.games ?? [];
  } catch {
    return [];
  }
}

export function gameById(games: Game[], id: string): Game | null {
  return games.find((g) => g.id === id) ?? null;
}
