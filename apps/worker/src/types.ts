import type { Game } from "@jamful/shared";

export type RegistryPayload = {
  games: Game[];
  updated_at: number;
};

export type JWTPayload = {
  sub: string;
  name?: string;
  av?: string;
};

export type PresenceQueueMessage = {
  friend_user_id: string;
  session_id: string;
  game_id: string;
  started_at: number;
};

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
