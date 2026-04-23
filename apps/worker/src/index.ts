import type {
  FeedEntry,
  GraphStatusResponse,
} from "@jamful/shared";
import {
  buildXAuthorizationUrl,
  exchangeXAuthorizationCode,
  fetchXMe,
  isAllowedExtensionRedirectUri,
} from "./auth-x";
import { signAccessToken, verifyAccessToken } from "./auth-jwt";
import { encryptSecret } from "./crypto";
import { getActiveFeedRows } from "./feed";
import { gameById, getRegistryGames } from "./games";
import { handleGraphSyncMessage } from "./graph-sync";
import { handlePresenceQueueMessage } from "./presence-events";
import {
  logWorkerError,
  logWorkerEvent,
  sanitizeGraphSyncMessage,
  signInFailedMessage,
  signInUnavailableMessage,
} from "./public-errors";
import type { GraphSyncQueueMessage, JWTPayload, PresenceQueueMessage } from "./types";
import { UserPresenceDO } from "./user-presence-do";
import {
  getGraphStatus,
  queueGraphSyncRun,
  upsertOAuthCredential,
  upsertUserFromX,
} from "./users";

export { UserPresenceDO };

const MANUAL_FOLLOWINGS_SYNC_MIN_INTERVAL_MS = 60_000;

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

function graphSummary(status: GraphStatusResponse) {
  return {
    status: status.status,
    last_synced_at: status.last_synced_at,
    error_message: sanitizeGraphSyncMessage(status.error_message),
  };
}

function sanitizeGraphStatus(status: GraphStatusResponse): GraphStatusResponse {
  return {
    ...status,
    error_message: sanitizeGraphSyncMessage(status.error_message),
    active_run: status.active_run
      ? {
          ...status.active_run,
          error_message: sanitizeGraphSyncMessage(status.active_run.error_message),
        }
      : null,
    last_run: status.last_run
      ? {
          ...status.last_run,
          error_message: sanitizeGraphSyncMessage(status.last_run.error_message),
        }
      : null,
  };
}

function misconfiguredResponse(
  origin: string | null,
  route: string,
  missing: string,
): Response {
  logWorkerEvent("worker misconfigured", { route, missing });
  return json(
    { error: "misconfigured", message: signInUnavailableMessage() },
    503,
    origin,
  );
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
        return misconfiguredResponse(origin, path, "X_CLIENT_ID");
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
      const clientId = env.X_CLIENT_ID?.trim();
      const clientSecret = env.X_CLIENT_SECRET?.trim() || undefined;
      if (!clientId) {
        return misconfiguredResponse(origin, path, "X_CLIENT_ID");
      }
      if (!env.JWT_SECRET) {
        return misconfiguredResponse(origin, path, "JWT_SECRET");
      }
      if (!env.X_REFRESH_TOKEN_ENC_KEY?.trim()) {
        return misconfiguredResponse(origin, path, "X_REFRESH_TOKEN_ENC_KEY");
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
        const xTokens = await exchangeXAuthorizationCode(clientId, clientSecret, {
          code: body.code,
          codeVerifier: body.code_verifier,
          redirectUri: body.redirect_uri,
        });
        if (!xTokens.refresh_token) {
          logWorkerEvent("x auth missing refresh token", { route: path });
          return json(
            {
              error: "missing_refresh_token",
              message: signInFailedMessage(),
            },
            503,
            origin,
          );
        }

        const { user: me } = await fetchXMe(xTokens.access_token);
        const user = await upsertUserFromX(env.JAMFUL_D1, me, { touchLogin: true });
        const encrypted = await encryptSecret(xTokens.refresh_token, env);
        await upsertOAuthCredential(
          env.JAMFUL_D1,
          user.id,
          me.id,
          encrypted,
          xTokens.scope ?? null,
        );
        await queueGraphSyncRun(env.JAMFUL_D1, env.GRAPH_SYNC_QUEUE, user.id, "initial");
        const payload: JWTPayload = {
          sub: user.id,
          xid: me.id,
          name: me.name,
          av: me.profile_image_url ?? "",
        };
        const access_token = await signAccessToken(payload, env.JWT_SECRET, 60 * 60 * 24 * 30);
        const status = await getGraphStatus(env.JAMFUL_D1, user.id);
        return json(
          {
            access_token,
            token_type: "Bearer",
            user_id: user.id,
            x_username: me.username,
            user: {
              id: user.id,
              x_user_id: me.id,
              x_username: me.username,
              name: me.name,
              avatar_url: me.profile_image_url ?? "",
            },
            graph_sync: {
              ...graphSummary(status),
            },
            avatar_url: me.profile_image_url ?? "",
          },
          200,
          origin,
        );
      } catch (e) {
        logWorkerError("x auth token exchange failed", e, { route: path });
        return json(
          { error: "x_auth_failed", message: signInFailedMessage() },
          400,
          origin,
        );
      }
    }

    if (path === "/graph/resync" && request.method === "POST") {
      const user = await authUser(request, env);
      if (!user?.sub) return json({ error: "unauthorized" }, 401, origin);
      const { run, throttled } = await queueGraphSyncRun(
        env.JAMFUL_D1,
        env.GRAPH_SYNC_QUEUE,
        user.sub,
        "manual",
        { minIntervalMs: MANUAL_FOLLOWINGS_SYNC_MIN_INTERVAL_MS },
      );
      const status = await getGraphStatus(env.JAMFUL_D1, user.sub);
      return json(
        {
          sync_run_id: run.id,
          status: run.status,
          requested_at: run.requested_at,
          last_synced_at: status.last_synced_at,
          throttled,
        },
        throttled ? 200 : run.status === "queued" ? 202 : 200,
        origin,
      );
    }

    if (path === "/graph/status" && request.method === "GET") {
      const user = await authUser(request, env);
      if (!user?.sub) return json({ error: "unauthorized" }, 401, origin);
      const status = await getGraphStatus(env.JAMFUL_D1, user.sub);
      return json(sanitizeGraphStatus(status), 200, origin);
    }

    if (path === "/games" && request.method === "GET") {
      const user = await authUser(request, env);
      if (!user?.sub) return json({ error: "unauthorized" }, 401, origin);
      const games = getRegistryGames();
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
      const games = getRegistryGames();
      const rows = await getActiveFeedRows(env.JAMFUL_D1, user.sub);
      const entries: FeedEntry[] = [];
      for (const row of rows) {
        const game = gameById(games, row.game_id);
        if (!game) continue;
        entries.push({
          friend: { name: row.friend_name, avatar_url: row.avatar_url },
          game: { name: game.name, url: game.url, icon_url: game.icon_url },
          session_id: row.session_id,
        });
      }
      return json(entries, 200, origin);
    }

    if (path === "/health" && request.method === "GET") {
      return json({ ok: true }, 200, origin);
    }

    return json({ error: "not_found" }, 404, origin);
  },

  async queue(batch: MessageBatch<GraphSyncQueueMessage | PresenceQueueMessage>, env: Env): Promise<void> {
    if (batch.queue === "graph-sync") {
      for (const msg of batch.messages as readonly Message<GraphSyncQueueMessage>[]) {
        await handleGraphSyncMessage(env, msg);
      }
      return;
    }

    if (batch.queue === "presence-events") {
      for (const msg of batch.messages as readonly Message<PresenceQueueMessage>[]) {
        await handlePresenceQueueMessage(env, msg);
      }
      return;
    }

    batch.ackAll();
  },
};
