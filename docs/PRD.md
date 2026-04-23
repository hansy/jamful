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

- User logs in via X through extension
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

### 3.7 Toolbar Updates (Feed-Based)

#### Toolbar Status Rule

Update toolbar state when:

- the background refreshes `GET /feed`
- the user starts or stops broadcasting presence

#### Client Behavior

- redraw the toolbar icon with the latest number of friends online
- update the action title to reflect online count and broadcasting state
- do not show browser notifications
- do not use Chrome badge text

---

### 3.8 Background-Owned Feed Cache

The extension keeps the latest `GET /feed` response in extension storage so the
popup and toolbar use the same source of truth.

```
PopupFeedCache {
  entries: FeedEntry[]
  fetchedAt: number | null
  error: string | null
}
```

---

## 4. Extension Architecture

### Background Script

- Tracks tab changes
- Runs heartbeat loop
- Polls `/feed`
- Updates toolbar icon/title
- Owns popup feed cache

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

## 6. Polling Logic (Feed)

Background stores:

- `popupFeedCache`
- last successful online-friends count

Flow:

1. Background polls `/feed`
2. Store the result in extension storage
3. Redraw toolbar icon/title from the current count
4. Popup reads from the shared cache

---

## 7. Permissions Model

- No `<all_urls>`
- No optional host-permission request flow
- Request only:
  - `storage`
  - `identity`
  - `tabs`
  - `alarms`
  - `host_permissions` for the API origin

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
  - Auth (X)
  - Game registry endpoint
  - Presence endpoints (heartbeat)
  - Feed endpoint
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

- **Queues (fanout)**
  - Topic: `presence-events`
  - Producer: `UserPresenceDO` on new session
  - Consumer:
    - Resolves followers of `friend_user_id`
    - Materializes current presence state for feed reads

- **Bundled registry data**
  - Game registry (id, name, url, icon_url) — populated from repo `data/seedGames.json` via `scripts/build-registry.ts` into `data/registry.v1.json`
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

### Follow Graph (v0)

- Materialized per followed user (e.g., stored in KV):
  - `followers:{user_id} -> Set<recipient_user_id>` (users who follow `user_id` and should see that activity reflected in feed/toolbars)

- Built from X API sync on sign-in (following list)

---

## 11. API Surface

### Auth

- `POST /auth/x/authorize-url` → returns X authorize URL (PKCE)
- `POST /auth/x/token` → exchanges code for Jamful session token

### Registry

- Authenticated `GET /games` (not a public anonymous catalog in v0)
- Registry JSON is built from `data/seedGames.json` into `data/registry.v1.json`; extension and worker both bundle that file locally

### Presence

- `POST /presence/heartbeat`
  - Body: `{ game_id: string }`
  - Worker routes to `UserPresenceDO(userId)`

### Feed

- `GET /feed`
  - Returns active sessions for followed users (derived from DOs)

## 12. Presence & Feed Flow

1. Extension detects game (URL match + active tab + dwell)
2. Extension sends heartbeat every 60s
3. Worker → `UserPresenceDO(userId)`
4. DO:
   - Creates/updates session
   - On new session → publishes to Queue

5. Background polls `/feed`
6. Background stores the latest feed in extension storage
7. Background updates the toolbar icon/title from `feed.length`
8. Popup reads the cached feed from storage

---

## 13. Extension Architecture

### Background (service worker)

- Detects tab changes + active tab
- Runs heartbeat loop (60s)
- Polls `/feed` (60s)
- Updates toolbar icon/title
- Owns popup feed cache

### Popup UI

- Reads cached feed from background-owned storage
- Requests a background refresh on open / every 60s while mounted
- Shows active friends and quick links to games

---

## 14. Permissions Model

- No `<all_urls>`
- No optional host permissions
- Use only:
  - `storage`
  - `identity`
  - `tabs`
  - `alarms`
  - `host_permissions` for the API origin

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
    extension/
      entrypoints/
        background.ts
        popup/
      wxt.config.ts
      # WXT: `wxt build -b chrome|firefox|edge|safari` from one codebase

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

  packages/
    extension-core/
      # browser-agnostic logic
      presence-state-machine/
      heartbeat/
      url-matching/

    extension-api/
      # API client wrappers

    shared/
      types/
      utils/

    graph/

  infra/
    cloudflare/
      wrangler.jsonc
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
- Abstract browser APIs (storage, identity, tabs, alarms, permissions)
- Avoid browser-specific logic leaking into core packages

---

## 19. MVP Scope

### Must Have

- Auth (X OAuth 2.0 with PKCE)
- Bundled game registry (from `data/seedGames.json` → `data/registry.v1.json`)
- URL detection
- Heartbeat (60s)
- `UserPresenceDO`
- Background feed polling
- Toolbar online-count updates
- Popup feed UI

### Not Included

- WebSockets (use polling)
- Developer SDK
- Advanced activity signals
- Analytics/BI (D1 later)

---

## 20. Key Decisions

- **Durable Objects for coordination** (presence)
- **Queues for async fanout**
- **Bundled registry JSON**
- **Polling (60s) for feed refresh**
- **Session-based dedupe using `session_id`**

---

## 21. Summary

System model:

- Extension detects game play
- Sends heartbeat to Worker
- `UserPresenceDO` maintains session state
- Background polls `/feed`
- Background updates the toolbar icon/title and popup cache

Goal:

> Reliable, simple, privacy-conscious social presence for web games using Cloudflare-native primitives
