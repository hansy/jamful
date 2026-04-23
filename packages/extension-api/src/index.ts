import type {
  AuthenticatedUser,
  FeedEntry,
  Game,
  GraphStatusResponse,
  NotificationsPollResult,
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

export type GraphResyncResponse = {
  sync_run_id: string;
  status: "queued" | "running";
  requested_at: number;
  last_synced_at: number | null;
};

export class JamfulApiClient {
  constructor(
    private baseUrl: string,
    private getToken: () => string | null,
  ) {}

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
      const text = await res.text();
      throw new Error(`API ${res.status}: ${text || res.statusText}`);
    }
    return res.json() as Promise<T>;
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

  async getNotifications(cursor: string | null): Promise<NotificationsPollResult> {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return this.request<NotificationsPollResult>(`/notifications${q}`);
  }

  async getGraphStatus(): Promise<GraphStatusResponse> {
    return this.request<GraphStatusResponse>("/graph/status");
  }

  async resyncGraph(): Promise<GraphResyncResponse> {
    return this.request<GraphResyncResponse>("/graph/resync", {
      method: "POST",
    });
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
