import type { InboxNotification, NotificationsPollResult } from "@jamful/shared";
import { parsePositiveInt } from "./db";
import type { PresenceQueueMessage } from "./types";

type NotificationRow = {
  seq: number;
  id: string;
  owner_user_id: string;
  actor_user_id: string;
  session_id: string;
  game_id: string;
  created_at: number;
  read_at: number | null;
};

export async function listNotifications(
  db: D1Database,
  ownerUserId: string,
  cursor: string | null,
): Promise<NotificationsPollResult> {
  const minSeq = parsePositiveInt(cursor, 0);
  const rows = await db
    .prepare(
      `SELECT
        rowid AS seq,
        id,
        owner_user_id,
        actor_user_id,
        session_id,
        game_id,
        created_at,
        read_at
      FROM notifications
      WHERE owner_user_id = ? AND rowid > ?
      ORDER BY rowid ASC
      LIMIT 50`,
    )
    .bind(ownerUserId, minSeq)
    .all<NotificationRow>();

  const items: InboxNotification[] = rows.results.map((row) => ({
    id: row.id,
    recipient_user_id: row.owner_user_id,
    friend_user_id: row.actor_user_id,
    session_id: row.session_id,
    game_id: row.game_id,
    created_at: row.created_at,
    read: row.read_at != null,
  }));
  const last = rows.results.at(-1);
  return {
    items,
    next_cursor: last ? String(last.seq) : null,
  };
}

export async function fanoutSessionStarted(
  db: D1Database,
  event: Extract<PresenceQueueMessage, { kind: "session_started" }>,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO presence_current (
        user_id,
        session_id,
        game_id,
        started_at,
        last_seen_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        session_id = excluded.session_id,
        game_id = excluded.game_id,
        started_at = excluded.started_at,
        last_seen_at = excluded.last_seen_at`,
    )
    .bind(
      event.user_id,
      event.session_id,
      event.game_id,
      event.started_at,
      event.emitted_at,
    )
    .run();

  const followers = await db
    .prepare(
      `SELECT follower_user_id
      FROM jamful_follow_edges
      WHERE followee_user_id = ?`,
    )
    .bind(event.user_id)
    .all<{ follower_user_id: string }>();

  if (followers.results.length === 0) return;

  await db.batch(
    followers.results.map((row) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO notifications (
            id,
            owner_user_id,
            type,
            actor_user_id,
            session_id,
            game_id,
            created_at,
            read_at
          ) VALUES (?, ?, 'friend_started_session', ?, ?, ?, ?, NULL)`,
        )
        .bind(
          `notif_${crypto.randomUUID()}`,
          row.follower_user_id,
          event.user_id,
          event.session_id,
          event.game_id,
          event.emitted_at,
        ),
    ),
  );
}

export async function fanoutSessionStopped(
  db: D1Database,
  event: Extract<PresenceQueueMessage, { kind: "session_stopped" }>,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM presence_current
      WHERE user_id = ? AND session_id = ?`,
    )
    .bind(event.user_id, event.session_id)
    .run();
}
