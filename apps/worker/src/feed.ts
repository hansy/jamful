export type ActiveFeedRow = {
  friend_user_id: string;
  friend_name: string;
  avatar_url: string;
  session_id: string;
  game_id: string;
  started_at: number;
};

export async function getActiveFeedRows(
  db: D1Database,
  ownerUserId: string,
): Promise<ActiveFeedRow[]> {
  const rows = await db
    .prepare(
      `SELECT
        p.user_id AS friend_user_id,
        u.display_name AS friend_name,
        u.avatar_url AS avatar_url,
        p.session_id AS session_id,
        p.game_id AS game_id,
        p.started_at AS started_at
      FROM jamful_follow_edges e
      JOIN presence_current p ON p.user_id = e.followee_user_id
      JOIN users u ON u.id = e.followee_user_id
      WHERE e.follower_user_id = ?
      ORDER BY p.started_at DESC`,
    )
    .bind(ownerUserId)
    .all<ActiveFeedRow>();
  return rows.results;
}
