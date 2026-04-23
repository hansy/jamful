import { DurableObject } from "cloudflare:workers";
import type { PresenceQueueMessage, SessionBlob } from "./types";

export class UserPresenceDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  private sessionExpiryMs(): number {
    const raw = this.env.SESSION_EXPIRY_MS;
    const n = raw ? parseInt(String(raw), 10) : 120_000;
    return Number.isFinite(n) ? n : 120_000;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const userId = request.headers.get("X-User-Id");
    if (!userId) {
      return Response.json({ error: "missing X-User-Id" }, { status: 400 });
    }

    if (request.method === "GET" && url.pathname.endsWith("/state")) {
      return this.handleGetState(userId);
    }

    if (request.method === "POST" && url.pathname.endsWith("/heartbeat")) {
      const body = (await request.json()) as { game_id?: string };
      if (!body.game_id || typeof body.game_id !== "string") {
        return Response.json({ error: "game_id required" }, { status: 400 });
      }
      return this.handleHeartbeat(userId, body.game_id);
    }

    if (request.method === "POST" && url.pathname.endsWith("/stop")) {
      return this.handleStop(userId);
    }

    return new Response("Not found", { status: 404 });
  }

  private async handleGetState(userId: string): Promise<Response> {
    const raw = await this.ctx.storage.get<SessionBlob>("session");
    const now = Date.now();
    const exp = this.sessionExpiryMs();
    if (!raw || now - raw.last_seen_at > exp) {
      return Response.json({ active: false });
    }
    return Response.json({
      active: true,
      session_id: raw.session_id,
      game_id: raw.game_id,
      started_at: raw.started_at,
      last_seen_at: raw.last_seen_at,
      user_id: userId,
    });
  }

  private async handleHeartbeat(userId: string, gameId: string): Promise<Response> {
    const now = Date.now();
    const exp = this.sessionExpiryMs();
    const prev = await this.ctx.storage.get<SessionBlob>("session");
    const expired = !prev || now - prev.last_seen_at > exp;
    const gameSwitch = !!(prev && prev.game_id !== gameId);
    const isNew = !prev || expired || gameSwitch;

    const session_id = isNew ? crypto.randomUUID() : prev!.session_id;
    const started_at = isNew ? now : prev!.started_at;

    const next: SessionBlob = {
      session_id,
      game_id: gameId,
      started_at,
      last_seen_at: now,
      user_id: userId,
    };
    await this.ctx.storage.put("session", next);
    await this.ctx.storage.setAlarm(now + exp);

    if (isNew) {
      const msg: PresenceQueueMessage = {
        kind: "session_started",
        user_id: userId,
        session_id,
        game_id: gameId,
        started_at,
        emitted_at: now,
      };
      await this.env.PRESENCE_QUEUE.send(msg);
    }

    return Response.json({ ok: true, is_new_session: isNew });
  }

  private async handleStop(userId: string): Promise<Response> {
    const prev = await this.ctx.storage.get<SessionBlob>("session");
    await this.ctx.storage.delete("session");
    await this.ctx.storage.deleteAlarm();
    if (prev) {
      const msg: PresenceQueueMessage = {
        kind: "session_stopped",
        user_id: userId,
        session_id: prev.session_id,
        game_id: prev.game_id,
        started_at: prev.started_at,
        emitted_at: Date.now(),
      };
      await this.env.PRESENCE_QUEUE.send(msg);
    }
    return Response.json({ ok: true });
  }

  async alarm(): Promise<void> {
    const prev = await this.ctx.storage.get<SessionBlob>("session");
    if (!prev) return;

    const expired = Date.now() - prev.last_seen_at > this.sessionExpiryMs();
    if (!expired) {
      await this.ctx.storage.setAlarm(prev.last_seen_at + this.sessionExpiryMs());
      return;
    }

    await this.ctx.storage.delete("session");
    const msg: PresenceQueueMessage = {
      kind: "session_stopped",
      user_id: prev.user_id,
      session_id: prev.session_id,
      game_id: prev.game_id,
      started_at: prev.started_at,
      emitted_at: Date.now(),
    };
    await this.env.PRESENCE_QUEUE.send(msg);
  }
}
