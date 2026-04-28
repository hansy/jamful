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

export type MockCurrentUserPresence = {
  user: FriendPreview;
  game: GamePreview;
};

export const DEV_MOCK_FEED_ENTRIES: FeedEntry[] = [
  {
    friend: {
      name: "@levelsio",
      avatar_url: "/avatars/levelsio.jpg",
    },
    game: {
      name: "Astropilot VR",
      url: "https://astropilot.mikekasberg.com",
      icon_url: "https://astropilot.mikekasberg.com/favicon.ico",
    },
    session_id: "mock-levelsio",
  },
  {
    friend: {
      name: "@marclou",
      avatar_url: "/avatars/marclou.jpg",
    },
    game: {
      name: "MoonCraft",
      url: "https://mooncraft.ericcampbell.dev",
      icon_url: "https://mooncraft.ericcampbell.dev/favicon.ico",
    },
    session_id: "mock-marclou",
  },
  {
    friend: {
      name: "@chongdashu",
      avatar_url: "/avatars/chongdashu.jpg",
    },
    game: {
      name: "Field of Command",
      url: "https://play.fieldofcommand.com",
      icon_url: "https://play.fieldofcommand.com/favicon.ico",
    },
    session_id: "mock-chongdashu",
  },
  {
    friend: {
      name: "@vincent31788",
      avatar_url: "/avatars/vincent31788.jpg",
    },
    game: {
      name: "bitwars",
      url: "https://bitwars.io",
      icon_url: "https://bitwars.io/favicon.ico",
    },
    session_id: "mock-vincent31788",
  },
];

export const DEV_MOCK_CURRENT_USER_PRESENCE: MockCurrentUserPresence = {
  user: {
    name: "@laxbrownie",
    avatar_url: "/avatars/laxbrownie.jpg",
  },
  game: {
    name: "Tiny Hamlet",
    url: "https://tinyhamlet.net",
    icon_url: "",
  },
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
