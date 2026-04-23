import type {
  GraphStatusResponse,
  GraphSyncRunSummary,
  GraphSyncStatus,
  GraphSyncTrigger,
} from "@jamful/shared";
import type { XUser } from "./auth-x";
import type { EncryptedSecretRecord } from "./crypto";
import { chunked, placeholders } from "./db";
import type { GraphSyncQueueMessage } from "./types";

export type UserRow = {
  id: string;
  x_user_id: string;
  x_username: string;
  display_name: string;
  avatar_url: string;
  created_at: number;
  updated_at: number;
  last_login_at: number;
  graph_sync_status: GraphSyncStatus;
  graph_last_synced_at: number | null;
  graph_last_error: string | null;
};

type OAuthCredentialRow = {
  user_id: string;
  provider_user_id: string;
  refresh_token_ciphertext: string;
  refresh_token_iv: string;
  refresh_token_kid: string;
  scope: string | null;
  token_updated_at: number;
};

type GraphSyncRunRow = {
  id: string;
  trigger: GraphSyncTrigger;
  status: GraphSyncStatus;
  requested_at: number;
  started_at: number | null;
  finished_at: number | null;
  jamful_edges_found: number | null;
  error_message: string | null;
};

function mapRun(row: GraphSyncRunRow | null): GraphSyncRunSummary | null {
  if (!row) return null;
  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    requested_at: row.requested_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
    jamful_edges_found: row.jamful_edges_found,
    error_message: row.error_message,
  };
}

export async function getUserById(db: D1Database, userId: string): Promise<UserRow | null> {
  return db
    .prepare(
      `SELECT
        id,
        x_user_id,
        x_username,
        display_name,
        avatar_url,
        created_at,
        updated_at,
        last_login_at,
        graph_sync_status,
        graph_last_synced_at,
        graph_last_error
      FROM users
      WHERE id = ?`,
    )
    .bind(userId)
    .first<UserRow>();
}

export async function upsertUserFromX(
  db: D1Database,
  user: XUser,
  options: { at?: number; touchLogin?: boolean } = {},
): Promise<UserRow> {
  const at = options.at ?? Date.now();
  const touchLogin = options.touchLogin ?? true;
  const existing = await db
    .prepare(
      `SELECT
        id,
        x_user_id,
        x_username,
        display_name,
        avatar_url,
        created_at,
        updated_at,
        last_login_at,
        graph_sync_status,
        graph_last_synced_at,
        graph_last_error
      FROM users
      WHERE x_user_id = ?`,
    )
    .bind(user.id)
    .first<UserRow>();

  const avatarUrl = user.profile_image_url ?? "";
  if (existing) {
    const lastLoginAt = touchLogin ? at : existing.last_login_at;
    await db
      .prepare(
        `UPDATE users
        SET x_username = ?, display_name = ?, avatar_url = ?, updated_at = ?, last_login_at = ?
        WHERE id = ?`,
      )
      .bind(user.username, user.name, avatarUrl, at, lastLoginAt, existing.id)
      .run();
    return {
      ...existing,
      x_username: user.username,
      display_name: user.name,
      avatar_url: avatarUrl,
      updated_at: at,
      last_login_at: lastLoginAt,
    };
  }

  const next: UserRow = {
    id: `usr_${crypto.randomUUID()}`,
    x_user_id: user.id,
    x_username: user.username,
    display_name: user.name,
    avatar_url: avatarUrl,
    created_at: at,
    updated_at: at,
    last_login_at: at,
    graph_sync_status: "never",
    graph_last_synced_at: null,
    graph_last_error: null,
  };
  await db
    .prepare(
      `INSERT INTO users (
        id,
        x_user_id,
        x_username,
        display_name,
        avatar_url,
        created_at,
        updated_at,
        last_login_at,
        graph_sync_status,
        graph_last_synced_at,
        graph_last_error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      next.id,
      next.x_user_id,
      next.x_username,
      next.display_name,
      next.avatar_url,
      next.created_at,
      next.updated_at,
      next.last_login_at,
      next.graph_sync_status,
      next.graph_last_synced_at,
      next.graph_last_error,
    )
    .run();
  return next;
}

export async function upsertOAuthCredential(
  db: D1Database,
  userId: string,
  providerUserId: string,
  encrypted: EncryptedSecretRecord,
  scope: string | null,
  at = Date.now(),
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO oauth_credentials (
        user_id,
        provider,
        provider_user_id,
        refresh_token_ciphertext,
        refresh_token_iv,
        refresh_token_kid,
        scope,
        token_updated_at
      ) VALUES (?, 'x', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        provider_user_id = excluded.provider_user_id,
        refresh_token_ciphertext = excluded.refresh_token_ciphertext,
        refresh_token_iv = excluded.refresh_token_iv,
        refresh_token_kid = excluded.refresh_token_kid,
        scope = excluded.scope,
        token_updated_at = excluded.token_updated_at`,
    )
    .bind(
      userId,
      providerUserId,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.kid,
      scope,
      at,
    )
    .run();
}

export async function getOAuthCredential(
  db: D1Database,
  userId: string,
): Promise<OAuthCredentialRow | null> {
  return db
    .prepare(
      `SELECT
        user_id,
        provider_user_id,
        refresh_token_ciphertext,
        refresh_token_iv,
        refresh_token_kid,
        scope,
        token_updated_at
      FROM oauth_credentials
      WHERE user_id = ?`,
    )
    .bind(userId)
    .first<OAuthCredentialRow>();
}

export async function getActiveGraphSyncRun(
  db: D1Database,
  userId: string,
): Promise<GraphSyncRunSummary | null> {
  const row = await db
    .prepare(
      `SELECT
        id,
        trigger,
        status,
        requested_at,
        started_at,
        finished_at,
        jamful_edges_found,
        error_message
      FROM graph_sync_runs
      WHERE user_id = ? AND status IN ('queued', 'running')
      ORDER BY requested_at DESC
      LIMIT 1`,
    )
    .bind(userId)
    .first<GraphSyncRunRow>();
  return mapRun(row);
}

export async function queueGraphSyncRun(
  db: D1Database,
  queue: Queue<GraphSyncQueueMessage>,
  userId: string,
  trigger: GraphSyncTrigger,
): Promise<{ run: GraphSyncRunSummary; created: boolean }> {
  const active = await getActiveGraphSyncRun(db, userId);
  if (active) {
    return { run: active, created: false };
  }

  const run: GraphSyncRunSummary = {
    id: `sync_${crypto.randomUUID()}`,
    trigger,
    status: "queued",
    requested_at: Date.now(),
    started_at: null,
    finished_at: null,
    jamful_edges_found: null,
    error_message: null,
  };

  await db.batch([
    db
      .prepare(
        `INSERT INTO graph_sync_runs (
          id,
          user_id,
          trigger,
          status,
          requested_at,
          started_at,
          finished_at,
          jamful_edges_found,
          error_code,
          error_message
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL)`,
      )
      .bind(run.id, userId, run.trigger, run.status, run.requested_at),
    db
      .prepare(
        `UPDATE users
        SET graph_sync_status = 'queued', graph_last_error = NULL
        WHERE id = ?`,
      )
      .bind(userId),
  ]);

  try {
    await queue.send({
      sync_run_id: run.id,
      user_id: userId,
      trigger,
      requested_at: run.requested_at,
    });
    return { run, created: true };
  } catch (error) {
    await markGraphSyncFailed(db, userId, run.id, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function markGraphSyncRunning(
  db: D1Database,
  userId: string,
  runId: string,
  at = Date.now(),
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE graph_sync_runs
        SET status = 'running', started_at = ?, finished_at = NULL, error_code = NULL, error_message = NULL
        WHERE id = ?`,
      )
      .bind(at, runId),
    db
      .prepare(
        `UPDATE users
        SET graph_sync_status = 'running', graph_last_error = NULL
        WHERE id = ?`,
      )
      .bind(userId),
  ]);
}

export async function markGraphSyncSucceeded(
  db: D1Database,
  userId: string,
  runId: string,
  jamfulEdgesFound: number,
  at = Date.now(),
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE graph_sync_runs
        SET status = 'succeeded', finished_at = ?, jamful_edges_found = ?, error_code = NULL, error_message = NULL
        WHERE id = ?`,
      )
      .bind(at, jamfulEdgesFound, runId),
    db
      .prepare(
        `UPDATE users
        SET graph_sync_status = 'succeeded', graph_last_synced_at = ?, graph_last_error = NULL
        WHERE id = ?`,
      )
      .bind(at, userId),
  ]);
}

export async function markGraphSyncFailed(
  db: D1Database,
  userId: string,
  runId: string,
  message: string,
  at = Date.now(),
): Promise<void> {
  await db.batch([
    db
      .prepare(
        `UPDATE graph_sync_runs
        SET status = 'failed', finished_at = ?, error_code = 'sync_failed', error_message = ?
        WHERE id = ?`,
      )
      .bind(at, message, runId),
    db
      .prepare(
        `UPDATE users
        SET graph_sync_status = 'failed', graph_last_error = ?
        WHERE id = ?`,
      )
      .bind(message, userId),
  ]);
}

export async function getGraphStatus(
  db: D1Database,
  userId: string,
): Promise<GraphStatusResponse> {
  const user = await getUserById(db, userId);
  if (!user) {
    return {
      status: "never",
      last_synced_at: null,
      error_message: null,
      active_run: null,
      last_run: null,
    };
  }

  const [activeRow, lastRow] = await Promise.all([
    db
      .prepare(
        `SELECT
          id,
          trigger,
          status,
          requested_at,
          started_at,
          finished_at,
          jamful_edges_found,
          error_message
        FROM graph_sync_runs
        WHERE user_id = ? AND status IN ('queued', 'running')
        ORDER BY requested_at DESC
        LIMIT 1`,
      )
      .bind(userId)
      .first<GraphSyncRunRow>(),
    db
      .prepare(
        `SELECT
          id,
          trigger,
          status,
          requested_at,
          started_at,
          finished_at,
          jamful_edges_found,
          error_message
        FROM graph_sync_runs
        WHERE user_id = ?
        ORDER BY requested_at DESC
        LIMIT 1`,
      )
      .bind(userId)
      .first<GraphSyncRunRow>(),
  ]);

  return {
    status: user.graph_sync_status,
    last_synced_at: user.graph_last_synced_at,
    error_message: user.graph_last_error,
    active_run: mapRun(activeRow),
    last_run: mapRun(lastRow),
  };
}

export async function lookupJamfulUserIdsByXUserIds(
  db: D1Database,
  xUserIds: readonly string[],
  excludeUserId: string,
): Promise<string[]> {
  const uniqueXUserIds = [...new Set(xUserIds.filter(Boolean))];
  if (uniqueXUserIds.length === 0) return [];

  const out = new Set<string>();
  for (const chunk of chunked(uniqueXUserIds, 200)) {
    const query = `SELECT id FROM users WHERE x_user_id IN (${placeholders(chunk.length)}) AND id != ?`;
    const rows = await db.prepare(query).bind(...chunk, excludeUserId).all<{ id: string }>();
    for (const row of rows.results) {
      out.add(row.id);
    }
  }
  return [...out];
}
