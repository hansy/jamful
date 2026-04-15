/**
 * X OAuth 2.0 authorization code + PKCE (user context).
 * @see https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
 */

export const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
export const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
export const X_API_BASE = "https://api.x.com/2";

/**
 * Minimum scopes only (see X “Scopes” table in the doc above):
 * - `users.read` — `/users/me` with username + `profile_image_url`
 * - `follows.read` — who the user follows (following ids for the social graph)
 * - `offline.access` — refresh token for long-lived sessions
 */
export const X_SCOPES = ["users.read", "follows.read", "offline.access"].join(" ");

export function isAllowedExtensionRedirectUri(redirectUri: string): boolean {
  try {
    const u = new URL(redirectUri);
    return u.protocol === "https:" && u.hostname.endsWith(".chromiumapp.org");
  } catch {
    return false;
  }
}

export function buildXAuthorizationUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const u = new URL(X_AUTHORIZE_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", opts.redirectUri);
  u.searchParams.set("scope", X_SCOPES);
  u.searchParams.set("state", opts.state);
  u.searchParams.set("code_challenge", opts.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  return u.href;
}

export async function exchangeXAuthorizationCode(
  clientId: string,
  clientSecret: string,
  input: { code: string; codeVerifier: string; redirectUri: string },
): Promise<{ access_token: string; refresh_token?: string }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
    client_id: clientId,
  });
  const basic = btoa(`${clientId}:${clientSecret}`);
  const res = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`X token exchange failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
  };
  if (!json.access_token) {
    throw new Error("X token response missing access_token");
  }
  return { access_token: json.access_token, refresh_token: json.refresh_token };
}

export type XUser = {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
};

export async function fetchXMe(accessToken: string): Promise<XUser> {
  const u = new URL(`${X_API_BASE}/users/me`);
  u.searchParams.set("user.fields", "name,username,profile_image_url");
  const res = await fetch(u.href, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`X users/me failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as {
    data?: { id: string; name: string; username: string; profile_image_url?: string };
  };
  const d = json.data;
  if (!d?.id) throw new Error("X users/me: missing user");
  return {
    id: d.id,
    name: d.name,
    username: d.username,
    profile_image_url: d.profile_image_url,
  };
}

/** Returns X user ids the user follows (best-effort pagination). */
export async function fetchXFollowingUserIds(
  accessToken: string,
  xUserId: string,
  maxPages = 5,
): Promise<string[]> {
  const ids: string[] = [];
  let token: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const u = new URL(`${X_API_BASE}/users/${encodeURIComponent(xUserId)}/following`);
    u.searchParams.set("max_results", "1000");
    u.searchParams.set("user.fields", "id");
    if (token) u.searchParams.set("pagination_token", token);
    const res = await fetch(u.href, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`X following failed: ${res.status} ${text}`);
    }
    const json = (await res.json()) as {
      data?: Array<{ id: string }>;
      meta?: { next_token?: string; result_count?: number };
    };
    for (const row of json.data ?? []) {
      if (row.id) ids.push(row.id);
    }
    token = json.meta?.next_token;
    if (!token) break;
  }
  return ids;
}
