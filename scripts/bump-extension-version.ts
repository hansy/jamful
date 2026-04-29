/**
 * Bumps the Chrome extension version when extension-shipped inputs changed.
 *
 * Run:
 *   bun run version:extension
 *   bun run version:extension -- --minor
 *   bun run version:extension -- --major
 */
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

type BumpKind = "patch" | "minor" | "major";

type PackageJson = {
  version?: string;
  [key: string]: unknown;
};

const root = fileURLToPath(new URL("..", import.meta.url));
const extensionPackagePath = join(root, "apps/extension/package.json");

const relevantPathPrefixes = [
  "apps/extension/",
  "packages/extension-api/",
  "packages/extension-core/",
  "packages/shared/",
  "data/games.json",
  "data/registry.v1.json",
];

function git(args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function parseBumpKind(args: string[]): BumpKind {
  if (args.includes("--major")) return "major";
  if (args.includes("--minor")) return "minor";
  if (args.includes("--patch")) return "patch";
  const unknown = args.filter((arg) => arg.startsWith("-"));
  if (unknown.length > 0) {
    throw new Error(`Unknown option: ${unknown.join(", ")}`);
  }
  return "patch";
}

function isRelevantPath(path: string): boolean {
  return relevantPathPrefixes.some((prefix) =>
    prefix.endsWith("/") ? path.startsWith(prefix) : path === prefix,
  );
}

function changedFiles(): string[] {
  const tracked = git(["diff", "--name-only", "HEAD", "--"]);
  const untracked = git(["ls-files", "--others", "--exclude-standard"]);
  return [...tracked.split("\n"), ...untracked.split("\n")]
    .map((path) => path.trim())
    .filter(Boolean)
    .filter(isRelevantPath)
    .sort();
}

function bumpVersion(version: string, kind: BumpKind): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(
      `Expected apps/extension/package.json version to be x.y.z, got ${version}`,
    );
  }
  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);

  if (kind === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (kind === "minor") {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }

  return `${major}.${minor}.${patch}`;
}

async function main(): Promise<void> {
  execFileSync("bun", ["run", "registry"], { cwd: root, stdio: "inherit" });

  const changed = changedFiles();
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const bumpKind = parseBumpKind(args.filter((arg) => arg !== "--force"));

  if (changed.length === 0 && !force) {
    console.log("No extension-shipped changes detected. Version unchanged.");
    return;
  }

  const rawPackage = await readFile(extensionPackagePath, "utf-8");
  const pkg = JSON.parse(rawPackage) as PackageJson;
  if (!pkg.version) {
    throw new Error("apps/extension/package.json is missing a version");
  }

  const previous = pkg.version;
  pkg.version = bumpVersion(previous, bumpKind);
  await writeFile(extensionPackagePath, `${JSON.stringify(pkg, null, 2)}\n`);

  console.log(`Bumped jamful-extension ${previous} -> ${pkg.version}`);
  if (changed.length > 0) {
    console.log("Detected extension-shipped changes:");
    for (const path of changed) console.log(`- ${path}`);
  } else {
    console.log("No changed files detected; bumped because --force was set.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
