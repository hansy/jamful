import { normalizeApiBase } from "./api-base";

function readApiBase(): { apiBase: string | null; error: string | null } {
  try {
    return {
      apiBase: normalizeApiBase(import.meta.env.WXT_API_BASE_URL, {
        mode: import.meta.env.DEV ? "development" : "production",
      }),
      error: null,
    };
  } catch (error) {
    return {
      apiBase: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function getConfiguredApiBaseOrNull(): string | null {
  return readApiBase().apiBase;
}

export function getConfiguredApiBaseError(): string | null {
  return readApiBase().error;
}
