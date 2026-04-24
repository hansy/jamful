export const DEFAULT_DEV_API_BASE_URL = "https://api.jamful.localhost";

type ApiBaseMode = "development" | "production";

function invalidApiBaseMessage(value: string): string {
  return `Invalid WXT_API_BASE_URL "${value}". Expected an absolute http(s) URL such as https://api.example.com or https://api.jamful.localhost.`;
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    normalized.endsWith(".localhost")
  );
}

export function normalizeApiBase(
  raw: string | null | undefined,
  options: { mode?: ApiBaseMode } = {},
): string {
  const mode = options.mode ?? "development";
  const value = raw?.trim();

  if (!value) {
    if (mode === "development") {
      return DEFAULT_DEV_API_BASE_URL;
    }
    throw new Error(
      "WXT_API_BASE_URL is required for production builds and must point to a non-local https:// origin.",
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(invalidApiBaseMessage(value));
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(invalidApiBaseMessage(value));
  }

  if (mode === "production") {
    if (url.protocol !== "https:" || isLocalHostname(url.hostname)) {
      throw new Error(
        `Invalid WXT_API_BASE_URL "${value}". Production builds require a non-local https:// origin.`,
      );
    }
  }

  const pathname = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${pathname === "/" ? "" : pathname}`;
}

export function apiHostPermissionPattern(apiBase: string): string {
  const url = new URL(apiBase);
  return `${url.protocol}//${url.hostname}/*`;
}
