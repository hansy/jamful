import type { FeedEntry, Game, InboxNotification, NotificationsPollResult } from "@jamful/shared";

export type AuthTokens = {
  access_token: string;
  token_type: "Bearer";
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

  async getFeed(): Promise<FeedEntry[]> {
    return this.request<FeedEntry[]>("/feed");
  }

  async getNotifications(cursor: string | null): Promise<NotificationsPollResult> {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
    return this.request<NotificationsPollResult>(`/notifications${q}`);
  }

  async devAuth(body: {
    user_id: string;
    display_name: string;
    avatar_url?: string;
    following?: string[];
  }): Promise<AuthTokens & { user_id: string }> {
    return this.request("/auth/dev", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      skipAuth: true,
    });
  }
}
