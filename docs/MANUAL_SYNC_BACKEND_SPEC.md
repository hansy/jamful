# Manual Sync Backend Spec

This document defines the backend rework for Jamful's "manual resync" model.

## Goals

- Persist X refresh tokens server-side so users can resync without re-authenticating.
- Store only Jamful-to-Jamful follow edges.
- Keep feed reads cheap.
- Keep heartbeats cheap.
- Make followings-list updates explicit via sign-in and a manual sync action.

## Non-Goals

- No automatic discovery when someone you follow later joins Jamful.
- No persistence of a user's full X followings graph.
- No requirement to keep the followings list continuously fresh.

## Product Behavior

- Initial sign-in creates or updates the Jamful user account, stores the X refresh token, and queues an initial followings sync.
- The popup exposes a sync action for the followings list.
- Pressing sync queues a new followings sync.
- The stored followings list only changes after sign-in or manual sync.
- If someone a user follows joins Jamful after the last sync, they do not appear until the next manual sync.

## Architecture

Use:

- `D1` for persistent user, auth, graph, feed, and notification data.
- `Queues` for background graph sync and presence fanout.
- `Durable Objects` only for per-user presence coordination.
- `KV` may continue to hold the game registry for now.

### Why this split

- D1 is the right primitive for durable indexed relationships and queryable feeds.
- Queue workers keep X sync and notification fanout off the request path.
- Presence DOs avoid writing to D1 on every heartbeat.

## Data Model

All timestamps are epoch milliseconds.

### `users`

Canonical Jamful user row. `id` is Jamful's internal user id and becomes the JWT subject.

```sql
CREATE TABLE users (
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

CREATE INDEX idx_users_x_username ON users (x_username);
```

### `oauth_credentials`

Stores the encrypted X refresh token. Do not store long-lived X access tokens.

```sql
CREATE TABLE oauth_credentials (
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
```

### `graph_sync_runs`

Tracks async sync jobs for UI state, retries, and debugging.

```sql
CREATE TABLE graph_sync_runs (
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

CREATE INDEX idx_graph_sync_runs_user_requested
  ON graph_sync_runs (user_id, requested_at DESC);
```

### `jamful_follow_edges`

Stores only the subset of X follows where both sides are Jamful users.

```sql
CREATE TABLE jamful_follow_edges (
  follower_user_id TEXT NOT NULL,
  followee_user_id TEXT NOT NULL,
  source_provider TEXT NOT NULL DEFAULT 'x',
  synced_at INTEGER NOT NULL,
  PRIMARY KEY (follower_user_id, followee_user_id),
  FOREIGN KEY (follower_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (followee_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_jamful_follow_edges_followee
  ON jamful_follow_edges (followee_user_id, follower_user_id);
```

### `presence_current`

Query-friendly active presence state. This avoids probing one presence DO per followed user on every popup refresh.

```sql
CREATE TABLE presence_current (
  user_id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_presence_current_started
  ON presence_current (started_at DESC);
```

### `notifications`

This replaces the inbox Durable Object.

```sql
CREATE TABLE notifications (
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

CREATE INDEX idx_notifications_owner_created
  ON notifications (owner_user_id, created_at DESC);
```

## Secrets and Encryption

Add a secret-backed encryption key for refresh token storage.

- `JWT_SECRET`
- `X_CLIENT_ID`
- `X_CLIENT_SECRET` if needed by the X app type
- `X_REFRESH_TOKEN_ENC_KEY`
- optional `X_REFRESH_TOKEN_ENC_KID`

Recommended approach:

- Encrypt refresh tokens with `AES-GCM` using Web Crypto.
- Store `ciphertext`, `iv`, and `kid` in `oauth_credentials`.
- Keep the raw key only in Worker secrets.

## JWT Changes

Current JWT `sub` is the X user id. Change it to the Jamful `users.id`.

JWT payload should include:

- `sub`: Jamful user id
- `xid`: X user id
- `name`
- `av`

This decouples app identity from the external provider.

## Queues

Use two queues.

### `GRAPH_SYNC_QUEUE`

Handles sign-in and manual resync jobs.

Message shape:

```ts
type GraphSyncQueueMessage = {
  sync_run_id: string;
  user_id: string;
  trigger: "initial" | "manual";
  requested_at: number;
};
```

### `PRESENCE_EVENTS_QUEUE`

Handles feed fanout and notifications on session start/stop.

Message shape:

```ts
type PresenceEventMessage = {
  kind: "session_started" | "session_stopped";
  user_id: string;
  session_id: string;
  game_id: string;
  started_at: number;
  emitted_at: number;
};
```

## API Contract

### `POST /auth/x/token`

Behavior changes:

- exchange code for X tokens
- fetch X profile
- upsert `users`
- upsert encrypted `oauth_credentials` using the X refresh token
- create Jamful JWT using internal `users.id`
- enqueue initial graph sync if one is not already queued or running

Response:

```json
{
  "access_token": "<jamful-jwt>",
  "token_type": "Bearer",
  "x_username": "elonmusk",
  "user": {
    "id": "usr_123",
    "x_user_id": "44196397",
    "x_username": "elonmusk",
    "name": "Elon Musk",
    "avatar_url": "https://..."
  },
  "graph_sync": {
    "status": "queued",
    "last_synced_at": null,
    "error_message": null
  }
}
```

### `POST /graph/resync`

Auth required.

Behavior:

- if a sync is already `queued` or `running`, return that run and do not enqueue a duplicate
- otherwise insert a `graph_sync_runs` row with `queued`
- update `users.graph_sync_status = 'queued'`
- enqueue `GRAPH_SYNC_QUEUE`

Response:

```json
{
  "sync_run_id": "sync_123",
  "status": "queued",
  "requested_at": 1760000000000,
  "last_synced_at": 1759990000000
}
```

Status codes:

- `202 Accepted` when queued
- `200 OK` if a queued/running sync already exists and is returned

### `GET /graph/status`

Auth required.

Response:

```json
{
  "status": "succeeded",
  "last_synced_at": 1760000000000,
  "active_run": null,
  "last_run": {
    "id": "sync_123",
    "trigger": "manual",
    "status": "succeeded",
    "requested_at": 1759999900000,
    "started_at": 1759999902000,
    "finished_at": 1760000000000,
    "jamful_edges_found": 12,
    "error_message": null
  }
}
```

### `GET /feed`

Auth required.

Implementation changes:

- query `jamful_follow_edges` joined with `presence_current`
- join friend profile data from `users`
- hydrate game metadata from the registry

The public response shape can remain the current `FeedEntry[]`.

### `GET /notifications`

Auth required.

Implementation changes:

- query D1 `notifications`
- cursor can be `created_at` or a synthetic opaque token

### `POST /presence/heartbeat`

Auth required.

Keep the public request shape:

```json
{ "game_id": "..." }
```

Implementation changes:

- route to `UserPresenceDO(user_id)`
- DO emits `session_started` only when a new session starts or game changes
- DO should set an alarm for expiry
- DO emits `session_stopped` on explicit stop or expiry

### `POST /presence/stop`

Auth required.

Implementation changes:

- route to `UserPresenceDO(user_id)`
- DO clears local session and emits `session_stopped` if a session was active

## Presence Durable Object

Keep one presence DO per Jamful user.

Responsibilities:

- track current session and last seen time
- determine when a heartbeat creates a new session
- schedule an expiry alarm
- emit queue events only on session start and session stop

Important change:

- the DO no longer needs to serve `/state` for the feed path
- `/feed` should not probe per-user DOs anymore

## Queue Worker Logic

### Graph sync worker

For a given `GraphSyncQueueMessage`:

1. Mark the run `running`.
2. Load and decrypt the user's refresh token.
3. Exchange refresh token for a fresh X access token.
4. Fetch the full X following list page by page.
5. For each page, batch-lookup Jamful users by `users.x_user_id`.
6. Build the next set of Jamful followee ids.
7. In one transaction:
   - delete existing `jamful_follow_edges` for the user
   - insert the new edge set
   - update `users.graph_sync_status`, `graph_last_synced_at`, `graph_last_error`
   - mark the run `succeeded`
8. Return the number of Jamful edges found.

Failure behavior:

- mark the run `failed`
- set `users.graph_sync_status = 'failed'`
- persist the error message
- retry queue delivery only for transient failures such as X 429 or 5xx

### Presence fanout worker

For `session_started`:

1. Query followers with:

```sql
SELECT follower_user_id
FROM jamful_follow_edges
WHERE followee_user_id = ?;
```

2. Upsert a `presence_current` row for the active user.
3. Insert a `notifications` row for each follower if `(owner_user_id, session_id)` was not already inserted.

For `session_stopped`:

1. Delete the `presence_current` row for that user and session.
2. Do not delete old notifications.

## Extension Changes

### Popup UI

Add:

- sync icon next to the followings count
- hover copy: `Sync your followings list`

Button behavior:

- on click, call `POST /graph/resync`
- repeat clicks are allowed from the UI
- backend rate limits followings sync requests and may no-op repeated clicks
- poll `GET /graph/status` every few seconds until completion or popup closes
- when sync finishes successfully, send `jamful:refresh-feed` to the background

### Background

No major changes required for the graph sync itself.

Keep:

- presence heartbeat loop
- cached `/feed` refresh

Remove any future dependency on `/notifications` via Durable Objects if notifications are moved fully to D1.

## Worker File Plan

Expected implementation areas:

- `apps/worker/src/index.ts`
  - add `POST /graph/resync`
  - add `GET /graph/status`
  - switch feed and notifications to D1 reads
  - update auth flow to create internal users and queue initial sync

- `apps/worker/src/auth-jwt.ts`
  - change JWT payload shape to internal user ids

- `apps/worker/src/auth-x.ts`
  - add refresh-token exchange helper

- `apps/worker/src/user-presence-do.ts`
  - emit `session_started` and `session_stopped`
  - remove feed-serving responsibilities

- new modules
  - `apps/worker/src/db.ts`
  - `apps/worker/src/crypto.ts`
  - `apps/worker/src/graph-sync.ts`
  - `apps/worker/src/feed.ts`
  - `apps/worker/src/notifications.ts`
  - `apps/worker/src/users.ts`

- `apps/worker/wrangler.jsonc`
  - add D1 binding
  - add graph sync queue binding
  - keep presence events queue binding

- `packages/extension-api/src/index.ts`
  - add `resyncGraph()`
  - add `getGraphStatus()`
  - adjust auth response typing

- `apps/extension/entrypoints/popup/App.tsx`
  - add button and status UI

## Migration Strategy

1. Add D1 and new tables.
2. Keep existing KV + DO code running while new writes are dual-written if needed.
3. Change auth flow to create internal users and store refresh tokens.
4. Introduce graph sync queue and new graph status endpoints.
5. Switch `/feed` reads to `presence_current` joined with `jamful_follow_edges`.
6. Switch `/notifications` reads to D1.
7. Remove old KV graph storage and inbox DO once the new path is verified.

## Open Decisions

- Keep the game registry in KV for now, or move it into D1 later.
- Whether to add `read` state mutation for notifications in this phase.
- Whether initial sign-in should block until the first sync finishes. Recommended: no, queue it and show sync status.

## Recommendation

Implement this in two passes:

1. D1 auth + manual graph sync + popup resync UI.
2. Feed/notification materialization and retirement of the old KV/inbox path.

This keeps the risky identity and graph changes separate from the feed-path rewrite.
