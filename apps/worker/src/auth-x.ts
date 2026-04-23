/**
 * X OAuth 2.0 authorization code + PKCE (user context).
 * @see https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
 */

export const X_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
export const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
/** X API v2 base (OAuth and REST use `api.x.com`). */
export const X_API_BASES = ["https://api.x.com/2"] as const;

/**
 * OAuth 2.0 scope strings from X (e.g. `follows.read`, not `account.follows.*`).
 * `GET /2/users/me` OpenAPI lists `OAuth2UserToken` with **both** `tweet.read` and `users.read`.
 * @see https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code
 * @see https://docs.x.com/x-api/users/user-lookup-me (operation security)
 */
export const X_SCOPES = [
  "tweet.read",
  "users.read",
  "follows.read",
  "offline.access",
].join(" ");

const X_API_HEADERS = {
  /** X recommends identifying the client; some 403s occur without a UA. */
  "User-Agent": "JamfulWorker/1.0",
} as const;

async function requestXToken(
  clientId: string,
  clientSecret: string | undefined,
  body: URLSearchParams,
): Promise<{
  access_token: string;
  refresh_token?: string;
  scope?: string;
}> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const secret = clientSecret?.trim();
  if (secret) {
    headers.Authorization = `Basic ${btoa(`${clientId}:${secret}`)}`;
  }
  const res = await fetch(X_TOKEN_URL, {
    method: "POST",
    headers,
    body,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || String(res.status));
  }
  const json = JSON.parse(text) as {
    access_token?: string;
    refresh_token?: string;
    scope?: string;
  };
  if (!json.access_token) {
    throw new Error(text || "missing access_token");
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    scope: json.scope,
  };
}

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

/**
 * Exchange auth code for tokens.
 * - **Confidential client** (Web App in portal): set `clientSecret` — uses `Authorization: Basic`.
 * - **Public client** (Native App — no secret in portal): pass empty `clientSecret` — PKCE only (required for some app types).
 */
export async function exchangeXAuthorizationCode(
  clientId: string,
  clientSecret: string | undefined,
  input: { code: string; codeVerifier: string; redirectUri: string },
): Promise<{
  access_token: string;
  refresh_token?: string;
  /** Space-separated scopes X granted (if returned). */
  scope?: string;
}> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
    client_id: clientId,
  });
  return requestXToken(clientId, clientSecret, body);
}

export async function refreshXAccessToken(
  clientId: string,
  clientSecret: string | undefined,
  refreshToken: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  scope?: string;
}> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  return requestXToken(clientId, clientSecret, body);
}

export type XUser = {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
};

export async function fetchXMe(
  accessToken: string,
): Promise<{ user: XUser; xApiBase: string }> {
  let lastBody = "";
  for (const base of X_API_BASES) {
    const uFields = new URL(`${base}/users/me`);
    uFields.searchParams.set("user.fields", "name,username,profile_image_url");

    const res = await fetch(uFields.href, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...X_API_HEADERS,
      },
    });
    const text = await res.text();

    if (res.ok) {
      const json = JSON.parse(text) as {
        data?: {
          id: string;
          name: string;
          username: string;
          profile_image_url?: string;
        };
      };
      const d = json.data;
      if (!d?.id) throw new Error(text);
      return {
        xApiBase: base,
        user: {
          id: d.id,
          name: d.name,
          username: d.username,
          profile_image_url: d.profile_image_url,
        },
      };
    }
    lastBody = text;
    if (res.status !== 403) break;
  }
  throw new Error(lastBody || "unknown");
}

/** Returns X user ids the user follows (best-effort pagination). */
export async function fetchXFollowingUserIds(
  accessToken: string,
  xUserId: string,
  xApiBase: string,
  maxPages = Number.POSITIVE_INFINITY,
): Promise<string[]> {
  const ids: string[] = [];
  let token: string | undefined;
  let page = 0;
  while (page < maxPages) {
    page += 1;
    const u = new URL(
      `${xApiBase}/users/${encodeURIComponent(xUserId)}/following`,
    );
    u.searchParams.set("max_results", "1000");
    u.searchParams.set("user.fields", "id");
    if (token) u.searchParams.set("pagination_token", token);
    const res = await fetch(u.href, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...X_API_HEADERS,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || String(res.status));
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
