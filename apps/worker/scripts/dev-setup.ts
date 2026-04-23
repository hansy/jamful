import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workerDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(workerDir, ".env.local");
const envExamplePath = resolve(workerDir, ".env.example");

function log(message: string): void {
  console.log(`[jamful worker setup] ${message}`);
}

function readEnvValue(source: string, key: string): string | null {
  const match = source.match(new RegExp(`^${key}=(.*)$`, "m"));
  return match ? match[1].trim() : null;
}

function writeEnvValue(source: string, key: string, value: string): string {
  const nextLine = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(source)) {
    return source.replace(pattern, nextLine);
  }

  const separator = source.length === 0 || source.endsWith("\n") ? "" : "\n";
  return `${source}${separator}${nextLine}\n`;
}

function ensureEnvFile(): void {
  if (existsSync(envPath)) return;
  copyFileSync(envExamplePath, envPath);
  log("Created .env.local from .env.example.");
}

function ensureGeneratedValue(
  source: string,
  key: string,
  generate: () => string,
  label: string,
): { next: string; changed: boolean } {
  const existing = readEnvValue(source, key);
  if (existing && existing.length > 0) {
    return { next: source, changed: false };
  }

  log(`Generated ${label} in .env.local.`);
  return {
    next: writeEnvValue(source, key, generate()),
    changed: true,
  };
}

ensureEnvFile();

let envText = readFileSync(envPath, "utf8");
let changed = false;

for (const [key, generate, label] of [
  [
    "JWT_SECRET",
    () => `dev-only-${randomBytes(32).toString("hex")}`,
    "a local JWT secret",
  ],
  [
    "X_REFRESH_TOKEN_ENC_KEY",
    () => randomBytes(32).toString("base64"),
    "a local refresh-token encryption key",
  ],
  ["X_REFRESH_TOKEN_ENC_KID", () => "v1", "a refresh-token key id"],
] as const) {
  const result = ensureGeneratedValue(envText, key, generate, label);
  envText = result.next;
  changed = changed || result.changed;
}

if (changed) {
  writeFileSync(envPath, envText);
}

const clientId = readEnvValue(envText, "X_CLIENT_ID");
if (!clientId) {
  log("X_CLIENT_ID is empty. X sign-in will fail until you set it in .env.local.");
}

const clientSecret = readEnvValue(envText, "X_CLIENT_SECRET");
if (!clientSecret) {
  log("X_CLIENT_SECRET is empty. Set it if your X app requires a client secret.");
}
