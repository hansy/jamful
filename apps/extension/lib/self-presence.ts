export const POPUP_SELF_PRESENCE_STORAGE_KEY = "popupSelfPresence";
export const POPUP_SELF_PRESENCE_EXPIRY_MS = 120_000;

export type PopupSelfPresence = {
  active: boolean;
  gameId: string | null;
  gameName: string | null;
  gameUrl: string | null;
  lastHeartbeatAt: number | null;
};

export function inactivePopupSelfPresence(): PopupSelfPresence {
  return {
    active: false,
    gameId: null,
    gameName: null,
    gameUrl: null,
    lastHeartbeatAt: null,
  };
}

export function coercePopupSelfPresence(raw: unknown): PopupSelfPresence {
  if (!raw || typeof raw !== "object") {
    return inactivePopupSelfPresence();
  }

  const value = raw as Record<string, unknown>;
  const active = value.active === true;
  const gameId = typeof value.gameId === "string" && value.gameId.length > 0 ? value.gameId : null;
  const gameName =
    typeof value.gameName === "string" && value.gameName.length > 0 ? value.gameName : null;
  const gameUrl = typeof value.gameUrl === "string" && value.gameUrl.length > 0 ? value.gameUrl : null;
  const lastHeartbeatAt =
    typeof value.lastHeartbeatAt === "number" && Number.isFinite(value.lastHeartbeatAt)
      ? value.lastHeartbeatAt
      : null;

  if (!active || !gameId || !gameName || !gameUrl || lastHeartbeatAt == null) {
    return inactivePopupSelfPresence();
  }

  return {
    active,
    gameId,
    gameName,
    gameUrl,
    lastHeartbeatAt,
  };
}

export function isPopupSelfPresenceFresh(
  presence: PopupSelfPresence,
  now = Date.now(),
): boolean {
  return !!(
    presence.active &&
    presence.gameId &&
    presence.gameName &&
    presence.gameUrl &&
    typeof presence.lastHeartbeatAt === "number" &&
    now - presence.lastHeartbeatAt <= POPUP_SELF_PRESENCE_EXPIRY_MS
  );
}
