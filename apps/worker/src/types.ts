import type { Game } from "@jamful/shared";

export type RegistryPayload = {
  games: Game[];
  updated_at: number;
};

export type JWTPayload = {
  sub: string;
  xid: string;
  name?: string;
  av?: string;
};

export type GraphSyncQueueMessage = {
  sync_run_id: string;
  user_id: string;
  trigger: "initial" | "manual";
  requested_at: number;
};

export type PresenceSessionStartedMessage = {
  kind: "session_started";
  user_id: string;
  session_id: string;
  game_id: string;
  started_at: number;
  emitted_at: number;
};

export type PresenceSessionStoppedMessage = {
  kind: "session_stopped";
  user_id: string;
  session_id: string;
  game_id: string;
  started_at: number;
  emitted_at: number;
};

export type PresenceQueueMessage =
  | PresenceSessionStartedMessage
  | PresenceSessionStoppedMessage;

export type SessionBlob = {
  session_id: string;
  game_id: string;
  started_at: number;
  last_seen_at: number;
  user_id: string;
};

export type ProfileBlob = {
  name: string;
  avatar_url: string;
};
