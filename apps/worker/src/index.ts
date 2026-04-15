import type { FeedEntry } from "@jamful/shared";
import { signAccessToken, verifyAccessToken } from "./auth-jwt";
import { gameById, getRegistryGames } from "./games";
import {
  getFollowing,
  getProfile,
  getFollowers,
  putProfile,
  setFollowingGraph,
} from "./social";
import type { JWTPayload, PresenceQueueMessage } from "./types";
import { UserInboxDO } from "./user-inbox-do";
import { UserPresenceDO } from "./user-presence-do";

export { UserInboxDO, UserPresenceDO };

function corsHeaders(origin: string | null): HeadersInit {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

async function authUser(request: Request, env: Env): Promise<JWTPayload | null> {
  const h = request.headers.get("Authorization");
  if (!h?.startsWith("Bearer ")) return null;
  const token = h.slice(7);
  if (!env.JWT_SECRET) return null;
  return verifyAccessToken(token, env.JWT_SECRET);
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const path = url.pathname.replace(/\/$/, "") || "/";

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin) });
    }

    if (path === "/auth/twitter" && request.method === "POST") {
      return json(
        {
          error: "not_implemented",
          message: "Use POST /auth/dev in development or configure X OAuth credentials.",
        },
        501,
        origin,
      );
    }

    if (path === "/auth/dev" && request.method === "POST") {
      if (String(env.ENVIRONMENT) === "production") {
        return json({ error: "forbidden" }, 403, origin);
      }
      const body = (await request.json()) as {
        user_id?: string;
        display_name?: string;
        avatar_url?: string;
        following?: string[];
      };
      if (!body.user_id || !body.display_name) {
        return json({ error: "user_id and display_name required" }, 400, origin);
      }
      await putProfile(env.JAMFUL_KV, body.user_id, {
        name: body.display_name,
        avatar_url: body.avatar_url ?? "",
      });
      await setFollowingGraph(env.JAMFUL_KV, body.user_id, body.following ?? []);
      const payload: JWTPayload = {
        sub: body.user_id,
        name: body.display_name,
        av: body.avatar_url ?? "",
      };
      const access_token = await signAccessToken(payload, env.JWT_SECRET, 60 * 60 * 24 * 30);
      return json(
        {
          access_token,
          token_type: "Bearer",
          user_id: body.user_id,
        },
        200,
        origin,
      );
    }

    if (path === "/games" && request.method === "GET") {
      const user = await authUser(request, env);
      if (!user?.sub) return json({ error: "unauthorized" }, 401, origin);
      const games = await getRegistryGames(env);
      return json(games, 200, origin);
    }

    if (path === "/presence/heartbeat" && request.method === "POST") {
      const user = await authUser(request, env);
      if (!user?.sub) return json({ error: "unauthorized" }, 401, origin);
      const body = (await request.json()) as { game_id?: string };
      if (!body.game_id) return json({ error: "game_id required" }, 400, origin);
      const stub = env.USER_PRESENCE.get(env.USER_PRESENCE.idFromName(user.sub));
      const res = await stub.fetch(
        new Request("https://do/heartbeat", {
          method: "POST",
          headers: {
            "X-User-Id": user.sub,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ game_id: body.game_id }),
        }),
      );
      const text = await res.text();
      return new Response(text, {
        status: res.status,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    if (path === "/feed" && request.method === "GET") {
      const user = await authUser(request, env);
      if (!user?.sub) return json({ error: "unauthorized" }, 401, origin);
      const following = await getFollowing(env.JAMFUL_KV, user.sub);
      const games = await getRegistryGames(env);
      const entries: FeedEntry[] = [];

      await Promise.all(
        following.map(async (friendId) => {
          const stub = env.USER_PRESENCE.get(env.USER_PRESENCE.idFromName(friendId));
          const pres = await stub.fetch(
            new Request("https://do/state", {
              headers: { "X-User-Id": friendId },
            }),
          );
          const state = (await pres.json()) as {
            active?: boolean;
            session_id?: string;
            game_id?: string;
          };
          if (!state.active || !state.session_id || !state.game_id) return;
          const prof =
            (await getProfile(env.JAMFUL_KV, friendId)) ?? {
              name: friendId,
              avatar_url: "",
            };
          const g = gameById(games, state.game_id);
          if (!g) return;
          entries.push({
            friend: { name: prof.name, avatar_url: prof.avatar_url },
            game: { name: g.name, url: g.url, icon_url: g.icon_url },
            session_id: state.session_id,
          });
        }),
      );

      return json(entries, 200, origin);
    }

    if (path === "/notifications" && request.method === "GET") {
      const user = await authUser(request, env);
      if (!user?.sub) return json({ error: "unauthorized" }, 401, origin);
      const cursor = url.searchParams.get("cursor");
      const stub = env.USER_INBOX.get(env.USER_INBOX.idFromName(user.sub));
      const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const res = await stub.fetch(
        new Request(`https://do/notifications${q}`, {
          headers: { "X-User-Id": user.sub },
        }),
      );
      const text = await res.text();
      return new Response(text, {
        status: res.status,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
      });
    }

    if (path === "/health" && request.method === "GET") {
      return json({ ok: true }, 200, origin);
    }

    return json({ error: "not_found" }, 404, origin);
  },

  async queue(batch: MessageBatch<PresenceQueueMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const { friend_user_id, session_id, game_id } = msg.body;
        const followers = await getFollowers(env.JAMFUL_KV, friend_user_id);
        for (const recipientId of followers) {
          const stub = env.USER_INBOX.get(env.USER_INBOX.idFromName(recipientId));
          await stub.fetch(
            new Request("https://do/append", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-User-Id": recipientId },
              body: JSON.stringify({
                friend_user_id,
                session_id,
                game_id,
              }),
            }),
          );
        }
        msg.ack();
      } catch {
        msg.retry();
      }
    }
  },
};
