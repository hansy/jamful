/** Game row synced to KV and returned to authenticated clients */
export type Game = {
  id: string;
  name: string;
  url: string;
  icon_url: string;
};

export type AuthenticatedUser = {
  id: string;
  x_user_id: string;
  x_username: string;
  name: string;
  avatar_url: string;
};

export type Session = {
  session_id: string;
  user_id: string;
  game_id: string;
  started_at: number;
  last_seen_at: number;
};

export type FriendPreview = {
  name: string;
  avatar_url: string;
};

export type GamePreview = {
  name: string;
  url: string;
  icon_url: string;
};

export type FeedEntry = {
  friend: FriendPreview;
  game: GamePreview;
  session_id: string;
};

export type DirectoryUser = {
  id: string;
  x_username: string;
  name: string;
  avatar_url: string;
  is_following: boolean;
};

export type DirectoryUsersResponse = {
  users: DirectoryUser[];
};

export type GraphSyncStatus =
  | "never"
  | "queued"
  | "running"
  | "succeeded"
  | "failed";

export type GraphSyncTrigger = "initial" | "manual";

export type GraphSyncRunSummary = {
  id: string;
  trigger: GraphSyncTrigger;
  status: GraphSyncStatus;
  requested_at: number;
  started_at: number | null;
  finished_at: number | null;
  jamful_edges_found: number | null;
  error_message: string | null;
};

export type GraphStatusResponse = {
  status: GraphSyncStatus;
  last_synced_at: number | null;
  error_message: string | null;
  active_run: GraphSyncRunSummary | null;
  last_run: GraphSyncRunSummary | null;
};
