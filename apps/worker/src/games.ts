import type { Game } from "@jamful/shared";
import registryJson from "../../../data/registry.v1.json";
import type { RegistryPayload } from "./types";

const registry = registryJson as RegistryPayload;

export function getRegistryGames(): Game[] {
  return registry.games ?? [];
}

export function gameById(games: Game[], id: string): Game | null {
  return games.find((g) => g.id === id) ?? null;
}
