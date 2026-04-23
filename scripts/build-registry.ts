/**
 * Maps data/seedGames.json → bundled registry payload (games array + updated_at).
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

const root = fileURLToPath(new URL("..", import.meta.url));

async function main(): Promise<void> {
  const raw = await readFile(join(root, "data/seedGames.json"), "utf-8");
  const rows = JSON.parse(raw) as SeedRow[];
  const games = rows.map((row) => ({
    id: row.game_host,
    name: row.game_name,
    url: row.game_url.replace(/\/+$/, "") || row.game_url,
    icon_url: "",
  }));
  const payload = { games, updated_at: Date.now() };
  const outDir = join(root, "data");
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, "registry.v1.json");
  await writeFile(outPath, JSON.stringify(payload, null, 0), "utf-8");
  console.log(`Wrote ${games.length} games to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
