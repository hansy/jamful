/**
 * Maps data/games.json → bundled registry payload (games array + updated_at).
 * Run: bun scripts/build-registry.ts
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

type SeedRow = {
  game_host: string;
  game_name: string;
  game_url: string;
};

type RegistryPayload = {
  games: Array<{
    id: string;
    name: string;
    url: string;
    icon_url: string;
  }>;
  updated_at: number;
};

const root = fileURLToPath(new URL("..", import.meta.url));

async function readExistingRegistry(
  outPath: string,
): Promise<RegistryPayload | null> {
  try {
    const raw = await readFile(outPath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<RegistryPayload>;
    if (!Array.isArray(parsed.games) || typeof parsed.updated_at !== "number") {
      return null;
    }
    return parsed as RegistryPayload;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const raw = await readFile(join(root, "data/games.json"), "utf-8");
  const rows = JSON.parse(raw) as SeedRow[];
  const games = rows.map((row) => ({
    id: row.game_host,
    name: row.game_name,
    url: row.game_url.replace(/\/+$/, "") || row.game_url,
    icon_url: "",
  }));
  const outDir = join(root, "data");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, "registry.v1.json");
  const existing = await readExistingRegistry(outPath);
  const updatedAt =
    existing && JSON.stringify(existing.games) === JSON.stringify(games)
      ? existing.updated_at
      : Date.now();
  const payload: RegistryPayload = { games, updated_at: updatedAt };
  await writeFile(outPath, JSON.stringify(payload, null, 0), "utf-8");
  console.log(`Wrote ${games.length} games to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
