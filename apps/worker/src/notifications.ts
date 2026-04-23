import type { PresenceQueueMessage } from "./types";

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
