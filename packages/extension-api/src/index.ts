import type {
  AuthenticatedUser,
  DirectoryUsersResponse,
  FeedEntry,
  Game,
  GraphStatusResponse,
} from "@jamful/shared";

export type AuthTokens = {
  access_token: string;
  token_type: "Bearer";
};

export type XAuthorizeUrlResponse = {
  authorization_url: string;
};

export type XTokenResponse = AuthTokens & {
  user_id: string;
  x_username: string;
  avatar_url: string;
  user: AuthenticatedUser;
  graph_sync: {
    status: GraphStatusResponse["status"];
    last_synced_at: number | null;
    error_message: string | null;
  };
};

type ApiErrorBody = {
  error?: unknown;
  message?: unknown;
};

export class JamfulApiError extends Error {
  readonly status: number;
  readonly code: string | null;

  constructor(status: number, code: string | null, message: string) {
    super(message);
    this.name = "JamfulApiError";
    this.status = status;
    this.code = code;
  }
}

export class JamfulApiClient {
  constructor(
    private baseUrl: string,
    private getToken: () => string | null,
  ) {}

  private async readBody<T>(res: Response): Promise<T> {
    const text = await res.text();
    if (!text) {
      return undefined as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      return text as T;
    }
  }

  private async request<T>(
    path: string,
    init: RequestInit & { skipAuth?: boolean } = {},
  ): Promise<T> {
    const { skipAuth, ...rest } = init;
    const headers = new Headers(rest.headers);
    if (!skipAuth) {
      const t = this.getToken();
      if (t) headers.set("Authorization", `Bearer ${t}`);
    }
    const url = `${this.baseUrl.replace(/\/$/, "")}${path}`;
    const res = await fetch(url, { ...rest, headers });
    if (!res.ok) {
      const body = await this.readBody<ApiErrorBody | string>(res);
      const payload =
        body && typeof body === "object" && !Array.isArray(body)
          ? (body as ApiErrorBody)
          : null;
      const code = typeof payload?.error === "string" ? payload.error : null;
      const message =
        typeof payload?.message === "string"
          ? payload.message
          : typeof body === "string" && body.trim()
            ? body
            : res.statusText || `Request failed (${res.status})`;
      throw new JamfulApiError(res.status, code, message);
    }
    return this.readBody<T>(res);
  }

  async getGames(): Promise<Game[]> {
    return this.request<Game[]>("/games");
  }

  async heartbeat(gameId: string): Promise<{ ok: boolean }> {
    return this.request("/presence/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ game_id: gameId }),
    });
  }

  async stopPresence(): Promise<{ ok: boolean }> {
    return this.request("/presence/stop", {
      method: "POST",
    });
  }

  async getFeed(): Promise<FeedEntry[]> {
    return this.request<FeedEntry[]>("/feed");
  }

  async getDirectoryUsers(query = ""): Promise<DirectoryUsersResponse> {
    const params = new URLSearchParams();
    const trimmed = query.trim();
    if (trimmed) params.set("q", trimmed);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return this.request<DirectoryUsersResponse>(`/users/directory${suffix}`);
  }

  async followUser(userId: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(
      `/users/${encodeURIComponent(userId)}/follow`,
      { method: "POST" },
    );
  }

  async unfollowUser(userId: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>(
      `/users/${encodeURIComponent(userId)}/follow`,
      { method: "DELETE" },
    );
  }

  async getGraphStatus(): Promise<GraphStatusResponse> {
    return this.request<GraphStatusResponse>("/graph/status");
  }

  async getXAuthorizationUrl(body: {
    code_challenge: string;
    state: string;
    redirect_uri: string;
  }): Promise<XAuthorizeUrlResponse> {
    return this.request<XAuthorizeUrlResponse>("/auth/x/authorize-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code_challenge: body.code_challenge,
        state: body.state,
        redirect_uri: body.redirect_uri,
      }),
      skipAuth: true,
    });
  }

  async exchangeXToken(body: {
    code: string;
    code_verifier: string;
    redirect_uri: string;
  }): Promise<XTokenResponse> {
    return this.request<XTokenResponse>("/auth/x/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      skipAuth: true,
    });
  }
}
