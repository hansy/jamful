CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  x_user_id TEXT NOT NULL UNIQUE,
  x_username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_login_at INTEGER NOT NULL,
  graph_sync_status TEXT NOT NULL DEFAULT 'never'
    CHECK (graph_sync_status IN ('never', 'queued', 'running', 'succeeded', 'failed')),
  graph_last_synced_at INTEGER,
  graph_last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_x_username ON users (x_username);

CREATE TABLE IF NOT EXISTS oauth_credentials (
  user_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'x',
  provider_user_id TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  refresh_token_iv TEXT NOT NULL,
  refresh_token_kid TEXT NOT NULL,
  scope TEXT,
  token_updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS graph_sync_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  trigger TEXT NOT NULL CHECK (trigger IN ('initial', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  requested_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  jamful_edges_found INTEGER,
  error_code TEXT,
  error_message TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_graph_sync_runs_user_requested
  ON graph_sync_runs (user_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_graph_sync_runs_user_status_requested
  ON graph_sync_runs (user_id, status, requested_at DESC);

CREATE TABLE IF NOT EXISTS jamful_follow_edges (
  follower_user_id TEXT NOT NULL,
  followee_user_id TEXT NOT NULL,
  source_provider TEXT NOT NULL DEFAULT 'x',
  synced_at INTEGER NOT NULL,
  PRIMARY KEY (follower_user_id, followee_user_id),
  FOREIGN KEY (follower_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (followee_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_jamful_follow_edges_followee
  ON jamful_follow_edges (followee_user_id, follower_user_id);

CREATE TABLE IF NOT EXISTS presence_current (
  user_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_presence_current_started
  ON presence_current (started_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('friend_started_session')),
  actor_user_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_owner_created
  ON notifications (owner_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_owner_session_type
  ON notifications (owner_user_id, session_id, type);
