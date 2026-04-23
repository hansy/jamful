export function chunked<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export function placeholders(count: number): string {
  if (count <= 0) throw new Error("placeholder count must be positive");
  return Array.from({ length: count }, () => "?").join(", ");
}

export const D1_MAX_BOUND_PARAMETERS = 100;

export function maxChunkSizeForBoundQuery(extraBoundParameters = 0): number {
  const size = D1_MAX_BOUND_PARAMETERS - extraBoundParameters;
  if (size <= 0) {
    throw new Error("extra bound parameter count exceeds D1 query limit");
  }
  return size;
}

export function parsePositiveInt(value: string | null | undefined, fallback: number): number {
  const parsed = value == null ? Number.NaN : parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
