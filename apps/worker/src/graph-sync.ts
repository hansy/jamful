import { fetchXFollowingUserIds, fetchXMe, refreshXAccessToken } from "./auth-x";
import { decryptSecret, encryptSecret } from "./crypto";
import { chunked, errorMessage, parsePositiveInt, placeholders } from "./db";
import type { GraphSyncQueueMessage } from "./types";
import {
  getOAuthCredential,
  lookupJamfulUserIdsByXUserIds,
  markGraphSyncFailed,
  markGraphSyncRunning,
  markGraphSyncSucceeded,
  upsertOAuthCredential,
  upsertUserFromX,
} from "./users";

function followSyncMaxPages(env: Env): number {
  return parsePositiveInt(env.X_FOLLOW_SYNC_MAX_PAGES, 25);
}

function isRetryable(error: unknown): boolean {
  return /\b(429|500|502|503|504)\b/.test(errorMessage(error));
}

async function replaceJamfulFollowEdges(
  db: D1Database,
  followerUserId: string,
  nextFolloweeIds: readonly string[],
): Promise<void> {
  const currentRows = await db
    .prepare(
      `SELECT followee_user_id
      FROM jamful_follow_edges
      WHERE follower_user_id = ?`,
    )
    .bind(followerUserId)
    .all<{ followee_user_id: string }>();

  const current = new Set(currentRows.results.map((row) => row.followee_user_id));
  const next = new Set(nextFolloweeIds);
  const toDelete = [...current].filter((id) => !next.has(id));
  const toInsert = [...next].filter((id) => !current.has(id));

  for (const chunk of chunked(toDelete, 100)) {
    const query = `DELETE FROM jamful_follow_edges WHERE follower_user_id = ? AND followee_user_id IN (${placeholders(chunk.length)})`;
    await db.prepare(query).bind(followerUserId, ...chunk).run();
  }

  if (toInsert.length > 0) {
    const syncedAt = Date.now();
    await db.batch(
      toInsert.map((followeeUserId) =>
        db
          .prepare(
            `INSERT INTO jamful_follow_edges (
              follower_user_id,
              followee_user_id,
              source_provider,
              synced_at
            ) VALUES (?, ?, 'x', ?)`,
          )
          .bind(followerUserId, followeeUserId, syncedAt),
      ),
    );
  }
}

async function executeGraphSync(env: Env, userId: string): Promise<number> {
  const credential = await getOAuthCredential(env.JAMFUL_DB, userId);
  if (!credential) {
    throw new Error("No refresh token stored for user");
  }
  if (!env.X_CLIENT_ID?.trim()) {
    throw new Error("X_CLIENT_ID is not set");
  }

  const refreshToken = await decryptSecret(
    {
      ciphertext: credential.refresh_token_ciphertext,
      iv: credential.refresh_token_iv,
      kid: credential.refresh_token_kid,
    },
    env,
  );
  const tokens = await refreshXAccessToken(
    env.X_CLIENT_ID.trim(),
    env.X_CLIENT_SECRET?.trim() || undefined,
    refreshToken,
  );

  if (tokens.refresh_token?.trim()) {
    const encrypted = await encryptSecret(tokens.refresh_token, env);
    await upsertOAuthCredential(
      env.JAMFUL_DB,
      userId,
      credential.provider_user_id,
      encrypted,
      tokens.scope ?? credential.scope,
    );
  }

  const { user: me, xApiBase } = await fetchXMe(tokens.access_token);
  await upsertUserFromX(env.JAMFUL_DB, me, { touchLogin: false });

  const followingIds = await fetchXFollowingUserIds(
    tokens.access_token,
    me.id,
    xApiBase,
    followSyncMaxPages(env),
  );
  const jamfulFolloweeIds = await lookupJamfulUserIdsByXUserIds(
    env.JAMFUL_DB,
    followingIds,
    userId,
  );
  await replaceJamfulFollowEdges(env.JAMFUL_DB, userId, jamfulFolloweeIds);
  return jamfulFolloweeIds.length;
}

export async function handleGraphSyncMessage(
  env: Env,
  msg: Message<GraphSyncQueueMessage>,
): Promise<void> {
  const { sync_run_id: runId, user_id: userId } = msg.body;
  await markGraphSyncRunning(env.JAMFUL_DB, userId, runId);

  try {
    const jamfulEdgesFound = await executeGraphSync(env, userId);
    await markGraphSyncSucceeded(env.JAMFUL_DB, userId, runId, jamfulEdgesFound);
    msg.ack();
  } catch (error) {
    await markGraphSyncFailed(env.JAMFUL_DB, userId, runId, errorMessage(error));
    if (msg.attempts < 3 && isRetryable(error)) {
      msg.retry();
      return;
    }
    msg.ack();
  }
}
