import { JamfulApiError } from "@jamful/extension-api";

const INTERNAL_MESSAGE_PATTERN =
  /\b(JWT_SECRET|X_CLIENT_ID|X_CLIENT_SECRET|X_REFRESH_TOKEN_ENC_KEY|code_challenge|code_verifier|redirect_uri|offline\.access|chromiumapp\.org|AES-GCM|base64)\b|^API \d+:|^\{.*\}$/i;

export function sanitizeServerMessage(
  message: string | null | undefined,
  fallback: string,
): string | null {
  const trimmed = message?.trim();
  if (!trimmed) return null;
  if (INTERNAL_MESSAGE_PATTERN.test(trimmed)) {
    return fallback;
  }
  return trimmed;
}

export function userFriendlyError(error: unknown, fallback: string): string {
  if (error instanceof JamfulApiError) {
    return sanitizeServerMessage(error.message, fallback) ?? fallback;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return "Jamful timed out. Try again.";
  }
  if (error instanceof TypeError) {
    return "Jamful couldn't reach the server. Check that the backend is running and try again.";
  }
  return fallback;
}

export function userFriendlyConfigError(raw: string | null): string | null {
  if (!raw) return null;
  return "Jamful isn't configured correctly in this build. Check the extension setup and try again.";
}

export function userFriendlyOAuthError(code: string | null): string {
  switch (code) {
    case "access_denied":
      return "Sign-in was cancelled.";
    case "temporarily_unavailable":
      return "X is temporarily unavailable. Try again.";
    default:
      return "Jamful couldn't finish signing you in with X. Try again.";
  }
}
