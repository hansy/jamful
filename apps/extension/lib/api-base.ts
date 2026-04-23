export const DEFAULT_API_BASE_URL = "http://127.0.0.1:8787";

export function normalizeApiBase(raw: string | null | undefined): string {
  const value = raw?.trim() || DEFAULT_API_BASE_URL;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      `Invalid WXT_API_BASE_URL "${value}". Expected an absolute URL such as https://api.example.com.`,
    );
  }

  const pathname = url.pathname.replace(/\/+$/, "");
  return `${url.origin}${pathname === "/" ? "" : pathname}`;
}

export function apiHostPermissionPattern(apiBase: string): string {
  const url = new URL(apiBase);
  return `${url.protocol}//${url.host}/*`;
}
