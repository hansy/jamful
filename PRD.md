# Web Game Social Presence Extension PRD (v0)

## 1. Overview

A browser extension that detects when users are playing web games and shows real-time (or near real-time) activity from people they follow, enabling quick discovery and play.

---

## 2. Core Principles

- Minimal developer integration (none required for MVP)
- Privacy-first (no full browsing tracking)
- Ephemeral presence (no long-term activity logging required)
- Simple, reliable state via heartbeat + expiry

---

## 3. Core Features

### 3.1 Authentication

- User logs in via Twitter/X through extension
- Extension stores session token (issued by backend)

---

### 3.2 Game Registry

Backend-managed list of games:

```
Game {
  id: string
  name: string
  url: string
  icon_url: string
}
```

Extension periodically fetches registry.

---

### 3.3 Presence Detection (Extension)

#### Detection Logic

A user is considered "playing" if:

- Current tab URL matches a game URL
- Tab is active
- Dwell time threshold is met (e.g. 5–10 seconds)

#### Session Lifecycle

1. Start session when detection criteria met
2. Maintain session via heartbeat
3. End session via expiry or tab change

---

### 3.4 Heartbeat System

#### Behavior

- Heartbeat sent every 60 seconds
- Only sent if:
  - Tab is active
  - URL still matches game

#### API

```
POST /presence/heartbeat
{
  game_id: string
}
```

#### Backend Behavior

- If no active session → create session
- Else → update `last_seen_at`

#### Expiry

- Session expires after 90–120 seconds without heartbeat

---

### 3.5 Presence Model

```
Session {
  session_id: string
  user_id: string
  game_id: string
  started_at: timestamp
  last_seen_at: timestamp
}
```

State is derived:

- Playing now → last_seen_at within threshold
- Inactive → expired

---

### 3.6 Feed

User opens extension popup:

Backend returns:

```
GET /feed
```

Response:

```
[
  {
    friend: {
      name: string,
      avatar_url: string
    },
    game: {
      name: string,
      url: string,
      icon_url: string
    },
    session_id: string
  }
]
```

---

### 3.7 Notifications (Polling-Based)

#### Polling

- Extension polls every 60 seconds:

```
GET /notifications?cursor=...
```

#### Notification Trigger Rule

Notify when:

- A friend starts a new session
- `(friend_id, session_id)` has not been notified before

#### Notification Types

- Friend started playing a game

#### Example

- "Alice is playing Orbit Duel"

#### Client Behavior

- Show browser notification
- Increment badge count

---

### 3.8 Notification Data Model

```
Notification {
  id: string
  viewer_user_id: string
  friend_user_id: string
  session_id: string
  created_at: timestamp
}
```

Server ensures no duplicate notifications per `(viewer, session_id)`.

---

## 4. Extension Architecture

### Background Script

- Tracks tab changes
- Runs heartbeat loop
- Polls notifications
- Displays notifications
- Updates badge count

### Popup UI

- Displays feed
- Shows active friends

---

## 5. Presence State Machine

States:

- Idle
- Detecting
- Playing

Transitions:

Idle → Detecting

- URL match

Detecting → Playing

- Dwell threshold reached

Playing → Idle

- Tab change
- URL mismatch
- Heartbeat expiry

---

## 6. Polling Logic (Notifications)

Client stores:

- `cursor`

Flow:

1. Poll `/notifications`
2. Receive new items
3. Show notifications
4. Update cursor

---

## 7. Permissions Model

- No `<all_urls>` initially
- Use optional host permissions

Flow for unknown domain:

1. User clicks extension
2. Prompt: "Enable this site"
3. Request host permission
4. Future visits auto-detected

---

## 8. Privacy

- Only detect known game URLs
- Match URLs locally when possible
- Do not send full browsing history
- Only send `game_id`
- Presence is ephemeral
- No global broadcast of activity

---

## 9. Infrastructure (Cloudflare-Native)

### Components

- **Workers (API edge)**
  - Auth (Twitter/X)
  - Game registry endpoint
  - Presence endpoints (heartbeat)
  - Feed + notifications endpoints
  - Routes requests to Durable Objects

- **Durable Objects (SQLite-backed)**
  - `UserPresenceDO(userId)`
    - Stores current session:
      - `session_id`
      - `game_id`
      - `started_at`
      - `last_seen_at`

    - Handles heartbeat → start/update session
    - Emits `session_started` events when a new session begins

  - `ViewerInboxDO(viewerId)`
    - Stores per-viewer notifications
    - Maintains unread count + cursor
    - Returns notifications since cursor on poll

- **Queues (fanout)**
  - Topic: `presence-events`
  - Producer: `UserPresenceDO` on new session
  - Consumer:
    - Resolves followers of `friend_user_id`
    - Enqueues notifications into each `ViewerInboxDO(viewerId)`

- **KV (global cache)**
  - Internal synced game registry (id, name, url, icon_url)
  - Canonical source is `https://vibej.am`
  - Updated by internal sync job
  - Optional: feature flags / config
  - Read-heavy, low-latency global access

- **D1 (optional, later)\*\***
  - Admin/analytics (users, follows, sessions, notifications)
  - Not required for v0 runtime

---

## 10. Data Model (Runtime)

### Game (KV)

```ts
Game {
  id: string
  name: string
  url: string
  icon_url: string
}
```

### Session (in `UserPresenceDO` storage)

```ts
Session {
  session_id: string
  user_id: string
  game_id: string
  started_at: timestamp
  last_seen_at: timestamp
}
```

### Notification (in `ViewerInboxDO` storage)

```ts
Notification {
  id: string
  viewer_user_id: string
  friend_user_id: string
  session_id: string
  game_id: string
  created_at: timestamp
  read: boolean
}
```

### Follow Graph (v0)

- Materialized per followed user (e.g., stored with `UserPresenceDO` or a dedicated DO):
  - `followers_of:{user_id} -> Set<viewer_user_id>`

- Built from Twitter/X sync on sign-in

---

## 11. API Surface

### Auth

- `POST /auth/twitter` → returns session token

### Registry

- No public registry endpoint in v0
- Internal sync process pulls supported games from `https://vibej.am`
- Worker reads from KV internally

### Presence

- `POST /presence/heartbeat`
  - Body: `{ game_id: string }`
  - Worker routes to `UserPresenceDO(userId)`

### Feed

- `GET /feed`
  - Returns active sessions for followed users (derived from DOs)

### Notifications

- `GET /notifications?cursor=...`
  - Worker routes to `ViewerInboxDO(viewerId)`
  - Returns new notifications + next cursor

---

## 12. Presence & Notification Flow

1. Extension detects game (URL match + active tab + dwell)
2. Extension sends heartbeat every 60s
3. Worker → `UserPresenceDO(userId)`
4. DO:
   - Creates/updates session
   - On new session → publishes to Queue

5. Queue consumer:
   - Fetches followers of `userId`
   - Enqueues notifications to each `ViewerInboxDO(viewerId)`

6. Extension polls `/notifications`
7. Inbox DO returns unseen notifications
8. Extension shows notification + updates badge

---

## 13. Extension Architecture

### Background (service worker)

- Detects tab changes + active tab
- Runs heartbeat loop (60s)
- Polls `/notifications` (60s)
- Displays notifications
- Updates badge count

### Popup UI

- Displays feed (`GET /feed`)
- Shows active friends and quick links to games
- Shows “Enable this site” for unknown domains

---

## 14. Permissions Model

- No `<all_urls>` initially
- Use `optional_host_permissions: ["https://*/*"]`

Flow for unknown domain:

1. User clicks extension
2. Prompt: “Enable this site”
3. Request host permission for current origin
4. Future visits auto-detected

---

## 15. Heartbeat & Expiry

- Heartbeat interval: **60s**
- Only sent if:
  - Tab is active
  - URL matches game

- Expiry window: **90–120s** without heartbeat
- Optional `stop` on navigation/tab change (best-effort)

---

## 16. Privacy Principles

- Match URLs locally; send only `game_id`
- Do not collect general browsing history
- Presence is ephemeral (no long-term logging required)
- Visibility limited to user’s social graph
- Users can disable tracking or specific sites

---

## 17. Monorepo Structure (Bun)

```bash
repo/
  apps/
    extension-chromium/
      src/
        background/
        popup/
        content/
      manifest.json

    extension-firefox/
      src/
        background/
        popup/
        content/
      manifest.json

    extension-safari/
      src/
        background/
        popup/
        content/
      # Safari Web Extension (Xcode project wrapper)

    worker/
      src/
        routes/
        auth/
        presence/
        notifications/

  packages/
    extension-core/
      # browser-agnostic logic
      presence-state-machine/
      heartbeat/
      url-matching/
      notification-dedupe/

    extension-api/
      # API client wrappers

    shared/
      types/
      utils/

    graph/

  infra/
    cloudflare/
      wrangler.toml
      migrations/
```

---

## 18. Browser Support Strategy

### V0 (Launch)

- Chromium-based browsers only
  - Chrome
  - Edge
  - Arc
  - Brave

### V1

- Add Firefox support
  - Expect minor differences in permissions and background handling

### Later

- Add Safari support via Safari Web Extensions
  - Requires Xcode project wrapper
  - Separate packaging/distribution flow

### Design Principles

- Keep all core logic in `packages/extension-core`
- Browser apps should be thin shells
- Abstract browser APIs (storage, notifications, permissions)
- Avoid browser-specific logic leaking into core packages

---

## 19. MVP Scope

### Must Have

- Auth
- Internal game sync from `https://vibej.am`
- KV-backed internal registry
- URL detection
- Auth
- Game registry (KV)
- URL detection
- Heartbeat (60s)
- Presence DO
- Queue fanout
- Viewer inbox DO
- Notification polling
- Popup feed UI

### Not Included

- WebSockets (use polling)
- Developer SDK
- Advanced activity signals
- Analytics/BI (D1 later)

---

## 20. Key Decisions

- **Durable Objects for coordination** (presence + inbox)
- **Queues for async fanout**
- **KV for registry**
- **Polling (60s) for notifications**
- **Session-based dedupe using `session_id`**

---

## 21. Summary

System model:

- Extension detects game play
- Sends heartbeat to Worker
- `UserPresenceDO` maintains session state
- New sessions are fanned out via Queue
- `ViewerInboxDO` stores per-viewer notifications
- Extension polls and displays updates

Goal:

> Reliable, simple, privacy-conscious social presence for web games using Cloudflare-native primitives
