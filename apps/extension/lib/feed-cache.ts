import type { FeedEntry } from "@jamful/shared";

export const POPUP_FEED_CACHE_STORAGE_KEY = "popupFeedCache";
export const FEED_CACHE_MIN_REFRESH_MS = 45_000;
export const REFRESH_FEED_MESSAGE_TYPE = "jamful:refresh-feed";

export type PopupFeedCache = {
  entries: FeedEntry[];
  fetchedAt: number | null;
  error: string | null;
};

export function emptyPopupFeedCache(): PopupFeedCache {
  return {
    entries: [],
    fetchedAt: null,
    error: null,
  };
}

function coerceFeedEntry(raw: unknown): FeedEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const friend = value.friend;
  const game = value.game;
  if (!friend || typeof friend !== "object" || !game || typeof game !== "object") {
    return null;
  }

  const friendValue = friend as Record<string, unknown>;
  const gameValue = game as Record<string, unknown>;
  if (
    typeof friendValue.name !== "string" ||
    typeof friendValue.avatar_url !== "string" ||
    typeof gameValue.name !== "string" ||
    typeof gameValue.url !== "string" ||
    typeof gameValue.icon_url !== "string" ||
    typeof value.session_id !== "string"
  ) {
    return null;
  }

  return {
    friend: {
      name: friendValue.name,
      avatar_url: friendValue.avatar_url,
    },
    game: {
      name: gameValue.name,
      url: gameValue.url,
      icon_url: gameValue.icon_url,
    },
    session_id: value.session_id,
  };
}

export function sortFeedEntries(entries: FeedEntry[]): FeedEntry[] {
  return [...entries].sort((a, b) =>
    a.friend.name.localeCompare(b.friend.name, undefined, { sensitivity: "base" }),
  );
}

export function coercePopupFeedCache(raw: unknown): PopupFeedCache {
  if (!raw || typeof raw !== "object") {
    return emptyPopupFeedCache();
  }

  const value = raw as Record<string, unknown>;
  const rawEntries = Array.isArray(value.entries) ? value.entries : [];
  const entries = sortFeedEntries(
    rawEntries.flatMap((entry) => {
      const coerced = coerceFeedEntry(entry);
      return coerced ? [coerced] : [];
    }),
  );
  const fetchedAt =
    typeof value.fetchedAt === "number" && Number.isFinite(value.fetchedAt)
      ? value.fetchedAt
      : null;
  const error = typeof value.error === "string" && value.error.length > 0 ? value.error : null;

  return {
    entries,
    fetchedAt,
    error,
  };
}
