import type { FeedEntry } from "@jamful/shared";
import {
  buildXAuthorizationUrl,
  exchangeXAuthorizationCode,
  fetchXFollowingUserIds,
  fetchXMe,
  isAllowedExtensionRedirectUri,
} from "./auth-x";
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

    if (path === "/auth/x/authorize-url" && request.method === "POST") {
      const clientId = env.X_CLIENT_ID;
      if (!clientId) {
        return json({ error: "misconfigured", message: "X_CLIENT_ID is not set" }, 503, origin);
      }
      const body = (await request.json()) as {
        code_challenge?: string;
        state?: string;
        redirect_uri?: string;
      };
      if (!body.code_challenge || !body.state || !body.redirect_uri) {
        return json(
          { error: "invalid_request", message: "code_challenge, state, redirect_uri required" },
          400,
          origin,
        );
      }
      if (!isAllowedExtensionRedirectUri(body.redirect_uri)) {
        return json(
          { error: "invalid_redirect_uri", message: "redirect_uri must be a https://*.chromiumapp.org URL" },
          400,
          origin,
        );
      }
      const authorization_url = buildXAuthorizationUrl({
        clientId,
        redirectUri: body.redirect_uri,
        state: body.state,
        codeChallenge: body.code_challenge,
      });
      return json({ authorization_url }, 200, origin);
    }

    if (path === "/auth/x/token" && request.method === "POST") {
      const clientId = env.X_CLIENT_ID;
      const clientSecret = env.X_CLIENT_SECRET;
      if (!clientId) {
        return json(
          { error: "misconfigured", message: "X_CLIENT_ID must be set" },
          503,
          origin,
        );
      }
      const body = (await request.json()) as {
        code?: string;
        code_verifier?: string;
        redirect_uri?: string;
      };
      if (!body.code || !body.code_verifier || !body.redirect_uri) {
        return json(
          { error: "invalid_request", message: "code, code_verifier, redirect_uri required" },
          400,
          origin,
        );
      }
      if (!isAllowedExtensionRedirectUri(body.redirect_uri)) {
        return json(
          { error: "invalid_redirect_uri", message: "redirect_uri must be a https://*.chromiumapp.org URL" },
          400,
          origin,
        );
      }
      try {
        const xTokens = await exchangeXAuthorizationCode(clientId, clientSecret?.trim() || undefined, {
          code: body.code,
          codeVerifier: body.code_verifier,
          redirectUri: body.redirect_uri,
        });
        const { user: me, xApiBase } = await fetchXMe(xTokens.access_token);
        const followingIds = await fetchXFollowingUserIds(
          xTokens.access_token,
          me.id,
          xApiBase,
        );
        await putProfile(env.JAMFUL_KV, me.id, {
          name: me.name,
          avatar_url: me.profile_image_url ?? "",
        });
        await setFollowingGraph(env.JAMFUL_KV, me.id, followingIds);
        const payload: JWTPayload = {
          sub: me.id,
          name: me.name,
          av: me.profile_image_url ?? "",
        };
        const access_token = await signAccessToken(payload, env.JWT_SECRET, 60 * 60 * 24 * 30);
        return json(
          {
            access_token,
            token_type: "Bearer",
            user_id: me.id,
            x_username: me.username,
            avatar_url: me.profile_image_url ?? "",
          },
          200,
          origin,
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return json({ error: "x_auth_failed", message }, 400, origin);
      }
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

    if (path === "/presence/stop" && request.method === "POST") {
      const user = await authUser(request, env);
      if (!user?.sub) return json({ error: "unauthorized" }, 401, origin);
      const stub = env.USER_PRESENCE.get(env.USER_PRESENCE.idFromName(user.sub));
      const res = await stub.fetch(
        new Request("https://do/stop", {
          method: "POST",
          headers: {
            "X-User-Id": user.sub,
          },
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
