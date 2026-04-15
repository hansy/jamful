import { DurableObject } from "cloudflare:workers";

type Row = {
  seq: number;
  id: string;
  /** User who owns this inbox (recipient of notifications). */
  recipient_user_id: string;
  friend_user_id: string;
  session_id: string;
  game_id: string;
  created_at: number;
  read: boolean;
};

type InboxState = {
  next_seq: number;
  rows: Row[];
};

const MAX_ROWS = 250;

/** Per-user notification inbox (one DO instance per recipient user id). */
export class UserInboxDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const inboxUserId = request.headers.get("X-User-Id");
    if (!inboxUserId) {
      return Response.json({ error: "missing X-User-Id" }, { status: 400 });
    }

    if (request.method === "POST" && url.pathname.endsWith("/append")) {
      const body = (await request.json()) as {
        friend_user_id?: string;
        session_id?: string;
        game_id?: string;
      };
      if (!body.friend_user_id || !body.session_id || !body.game_id) {
        return Response.json({ error: "invalid append body" }, { status: 400 });
      }
      return this.append(inboxUserId, body.friend_user_id, body.session_id, body.game_id);
    }

    if (request.method === "GET" && url.pathname.endsWith("/notifications")) {
      const cursor = url.searchParams.get("cursor");
      return this.listSince(inboxUserId, cursor);
    }

    return new Response("Not found", { status: 404 });
  }

  private async load(): Promise<InboxState> {
    const raw = await this.ctx.storage.get<InboxState>("inbox");
    return raw ?? { next_seq: 1, rows: [] };
  }

  private async save(state: InboxState): Promise<void> {
    await this.ctx.storage.put("inbox", state);
  }

  private async append(
    inboxUserId: string,
    friendUserId: string,
    sessionId: string,
    gameId: string,
  ): Promise<Response> {
    const state = await this.load();
    if (state.rows.some((r) => r.session_id === sessionId)) {
      return Response.json({ ok: true, deduped: true });
    }
    const seq = state.next_seq++;
    const id = `${seq}-${crypto.randomUUID().slice(0, 8)}`;
    const row: Row = {
      seq,
      id,
      recipient_user_id: inboxUserId,
      friend_user_id: friendUserId,
      session_id: sessionId,
      game_id: gameId,
      created_at: Date.now(),
      read: false,
    };
    state.rows.push(row);
    if (state.rows.length > MAX_ROWS) {
      state.rows.splice(0, state.rows.length - MAX_ROWS);
    }
    await this.save(state);
    return Response.json({ ok: true, id });
  }

  private async listSince(inboxUserId: string, cursor: string | null): Promise<Response> {
    const state = await this.load();
    const minSeq = cursor ? parseInt(cursor, 10) : 0;
    const filtered = state.rows.filter(
      (r) => r.recipient_user_id === inboxUserId && r.seq > minSeq,
    );
    const items = filtered.slice(0, 50);
    const last = items[items.length - 1];
    const next_cursor = last ? String(last.seq) : null;
    return Response.json({
      items: items.map((r) => ({
        id: r.id,
        recipient_user_id: r.recipient_user_id,
        friend_user_id: r.friend_user_id,
        session_id: r.session_id,
        game_id: r.game_id,
        created_at: r.created_at,
        read: r.read,
      })),
      next_cursor,
    });
  }
}
