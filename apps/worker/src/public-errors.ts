import { errorMessage } from "./db";

const SIGN_IN_UNAVAILABLE_MESSAGE =
  "Jamful sign-in is temporarily unavailable. Try again later.";
const SIGN_IN_FAILED_MESSAGE =
  "Jamful couldn't finish signing you in with X. Try again.";
const FOLLOWINGS_SYNC_UNAVAILABLE_MESSAGE =
  "Jamful couldn't refresh your followings list right now. Try again later.";
const FOLLOWINGS_SYNC_RECONNECT_MESSAGE =
  "Reconnect X and try syncing again.";

const WORKER_SECRET_PATTERN =
  /\b(JWT_SECRET|X_CLIENT_ID|X_CLIENT_SECRET|X_REFRESH_TOKEN_ENC_KEY)\b/i;
const FOLLOWINGS_SYNC_RECONNECT_PATTERN =
  /\b(No refresh token stored for user|invalid_grant|invalid_token|unauthorized|401|403)\b/i;
const INTERNAL_MESSAGE_PATTERN =
  /\b(code_challenge|code_verifier|redirect_uri|offline\.access|chromiumapp\.org|AES-GCM|base64)\b|^API \d+:|^\{.*\}$/i;

export function logWorkerEvent(
  event: string,
  details: Record<string, unknown> = {},
): void {
  console.error("[jamful]", event, JSON.stringify(details));
}

export function logWorkerError(
  event: string,
  error: unknown,
  details: Record<string, unknown> = {},
): void {
  console.error(
    "[jamful]",
    event,
    JSON.stringify({
      ...details,
      error: errorMessage(error),
    }),
  );
}

export function signInUnavailableMessage(): string {
  return SIGN_IN_UNAVAILABLE_MESSAGE;
}

export function signInFailedMessage(): string {
  return SIGN_IN_FAILED_MESSAGE;
}

export function sanitizeGraphSyncMessage(
  message: string | null | undefined,
): string | null {
  const trimmed = message?.trim();
  if (!trimmed) return null;
  if (WORKER_SECRET_PATTERN.test(trimmed) || INTERNAL_MESSAGE_PATTERN.test(trimmed)) {
    return FOLLOWINGS_SYNC_UNAVAILABLE_MESSAGE;
  }
  if (FOLLOWINGS_SYNC_RECONNECT_PATTERN.test(trimmed)) {
    return FOLLOWINGS_SYNC_RECONNECT_MESSAGE;
  }
  return trimmed;
}

export function graphSyncFailureMessage(error: unknown): string {
  return sanitizeGraphSyncMessage(errorMessage(error)) ?? FOLLOWINGS_SYNC_UNAVAILABLE_MESSAGE;
}
