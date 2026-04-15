/** Game row synced to KV and returned to authenticated clients */
export type Game = {
  id: string;
  name: string;
  url: string;
  icon_url: string;
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

export type InboxNotification = {
  id: string;
  recipient_user_id: string;
  friend_user_id: string;
  session_id: string;
  game_id: string;
  created_at: number;
  read: boolean;
};

export type NotificationsPollResult = {
  items: InboxNotification[];
  next_cursor: string | null;
};
