import type { Game } from "@jamful/shared";
import { JamfulApiClient } from "@jamful/extension-api";
import { matchTabUrlToGame } from "../lib/bundled-games";
import {
  FEED_CACHE_MIN_REFRESH_MS,
  POPUP_FEED_CACHE_STORAGE_KEY,
  REFRESH_FEED_MESSAGE_TYPE,
  coercePopupFeedCache,
  emptyPopupFeedCache,
  sortFeedEntries,
  type PopupFeedCache,
} from "../lib/feed-cache";
import { getConfiguredApiBaseOrNull } from "../lib/runtime-config";
import {
  POPUP_SELF_PRESENCE_STORAGE_KEY,
  coercePopupSelfPresence,
  inactivePopupSelfPresence,
  isPopupSelfPresenceFresh,
  type PopupSelfPresence,
} from "../lib/self-presence";
import { applyToolbarPresentation } from "../lib/toolbar-icon";

const HEARTBEAT_ALARM = "jamful-heartbeat";
const FEED_ALARM = "jamful-feed";
const DWELL_MS = 0;
const PRESENCE_INVISIBLE_KEY = "presenceInvisible";

let dwellTimer: ReturnType<typeof setTimeout> | null = null;
let dwellGeneration = 0;
let dwellTargetKey: string | null = null;
let playingGameId: string | null = null;
let selfPresence: PopupSelfPresence = inactivePopupSelfPresence();

/** `null` = signed out. `number` = last successful feed length (friends playing now). */
let friendsPlayingCount: number | null = null;
let feedRefreshPromise: Promise<void> | null = null;

function normalizeUrlForDwell(href: string): string {
  const u = new URL(href);
  const path = (u.pathname || "/").replace(/\/+$/, "") || "/";
  return `${u.origin}${path}`;
}

function resetDwellSession(): void {
  if (dwellTimer != null) {
    clearTimeout(dwellTimer);
    dwellTimer = null;
  }
  dwellTargetKey = null;
  dwellGeneration += 1;
}

async function stopPlaying(): Promise<void> {
  playingGameId = null;
  try {
    await browser.alarms.clear(HEARTBEAT_ALARM);
  } catch {
    /* ignore */
  }
  await writeSelfPresence(inactivePopupSelfPresence());
  await refreshToolbarPresentation();
}

async function getAuth(): Promise<{ base: string; token: string } | null> {
  const { accessToken } = await browser.storage.local.get(["accessToken"]);
  const base = getConfiguredApiBaseOrNull() ?? "";
  const token = typeof accessToken === "string" && accessToken.length > 0 ? accessToken : "";
  if (!base || !token) return null;
  return { base, token };
}

async function writeSelfPresence(next: PopupSelfPresence): Promise<void> {
  selfPresence = next;
  await browser.storage.local.set({
    [POPUP_SELF_PRESENCE_STORAGE_KEY]: next,
  });
}

async function setSelfPresenceActive(game: Game, at = Date.now()): Promise<void> {
  await writeSelfPresence({
    active: true,
    gameId: game.id,
    gameName: game.name,
    gameUrl: game.url,
    lastHeartbeatAt: at,
  });
}

async function hydrateSelfPresence(): Promise<void> {
  const stored = await browser.storage.local.get([POPUP_SELF_PRESENCE_STORAGE_KEY]);
  selfPresence = coercePopupSelfPresence(stored[POPUP_SELF_PRESENCE_STORAGE_KEY]);
  if (!isPopupSelfPresenceFresh(selfPresence)) {
    if (
      selfPresence.active ||
      selfPresence.gameId != null ||
      selfPresence.lastHeartbeatAt != null
    ) {
      await writeSelfPresence(inactivePopupSelfPresence());
    }
    return;
  }
  playingGameId = selfPresence.gameId;
  const existingHeartbeat = await browser.alarms.get(HEARTBEAT_ALARM);
  if (!existingHeartbeat) {
    await browser.alarms.create(HEARTBEAT_ALARM, { delayInMinutes: 1, periodInMinutes: 1 });
  }
}

async function isPresenceInvisible(): Promise<boolean> {
  const { presenceInvisible } = await browser.storage.local.get([PRESENCE_INVISIBLE_KEY]);
  return presenceInvisible === true;
}

async function isBroadcastingPresence(): Promise<boolean> {
  if (!isPopupSelfPresenceFresh(selfPresence) || selfPresence.gameId == null) return false;
  const tab = await activeTab();
  const game = tab ? matchTabUrlToGame(tab.href) : null;
  return !!(game && game.id === selfPresence.gameId);
}

async function refreshToolbarPresentation(): Promise<void> {
  const auth = await getAuth();
  const authed = !!auth;
  const invisible = authed && (await isPresenceInvisible());
  const broadcasting = authed && !invisible && (await isBroadcastingPresence());
  const onlineCount = authed ? (friendsPlayingCount ?? 0) : null;
  await applyToolbarPresentation({ onlineCount, broadcasting });
}

async function activeTab(): Promise<{ id: number; href: string } | null> {
  const tabs = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (tab.id == null) return null;
  const u = tab.url;
  if (!u || u.startsWith("chrome://") || u.startsWith("edge://") || u.startsWith("about:")) {
    return null;
  }
  if (u.startsWith(browser.runtime.getURL(""))) return null;
  return { id: tab.id, href: u };
}

async function sendHeartbeat(
  auth: { base: string; token: string },
  game: Game,
): Promise<boolean> {
  try {
    const client = new JamfulApiClient(auth.base, () => auth.token);
    await client.heartbeat(game.id);
    await setSelfPresenceActive(game);
    return true;
  } catch (e) {
    console.warn("[jamful] heartbeat failed", e);
    return false;
  }
}

async function sendStopPresence(auth: { base: string; token: string }): Promise<void> {
  try {
    const client = new JamfulApiClient(auth.base, () => auth.token);
    await client.stopPresence();
  } catch (e) {
    console.warn("[jamful] presence stop failed", e);
  }
}

async function enterInvisibleMode(): Promise<void> {
  const auth = await getAuth();
  resetDwellSession();
  await stopPlaying();
  if (auth) {
    await sendStopPresence(auth);
  }
}

async function enterPlaying(game: Game, auth: { base: string; token: string }): Promise<void> {
  await browser.alarms.clear(HEARTBEAT_ALARM);
  playingGameId = game.id;
  await sendHeartbeat(auth, game);
  await browser.alarms.create(HEARTBEAT_ALARM, { delayInMinutes: 1, periodInMinutes: 1 });
  await refreshToolbarPresentation();
}

async function completeDwell(gen: number, expectedGameId: string): Promise<void> {
  dwellTimer = null;
  if (gen !== dwellGeneration) return;
  dwellTargetKey = null;
  const auth = await getAuth();
  if (!auth) return;
  if (await isPresenceInvisible()) {
    await stopPlaying();
    return;
  }
  const tab = await activeTab();
  if (!tab) return;
  const game = matchTabUrlToGame(tab.href);
  if (!game || game.id !== expectedGameId) return;
  await enterPlaying(game, auth);
}

async function syncPresence(): Promise<void> {
  try {
    const auth = await getAuth();
    if (!auth) {
      resetDwellSession();
      await stopPlaying();
      return;
    }

    if (await isPresenceInvisible()) {
      resetDwellSession();
      await stopPlaying();
      return;
    }

    const tab = await activeTab();
    if (!tab) {
      resetDwellSession();
      await stopPlaying();
      return;
    }

    const game = matchTabUrlToGame(tab.href);
    if (!game) {
      resetDwellSession();
      await stopPlaying();
      return;
    }

    if (playingGameId === game.id) {
      resetDwellSession();
      return;
    }

    if (playingGameId != null && playingGameId !== game.id) {
      await stopPlaying();
    }

    if (DWELL_MS <= 0) {
      resetDwellSession();
      await enterPlaying(game, auth);
      return;
    }

    const nextKey = `${tab.id}|${game.id}|${normalizeUrlForDwell(tab.href)}`;
    if (dwellTargetKey === nextKey && dwellTimer != null) {
      return;
    }

    resetDwellSession();
    dwellTargetKey = nextKey;
    const gen = dwellGeneration;
    dwellTimer = setTimeout(() => void completeDwell(gen, game.id), DWELL_MS);
  } finally {
    await refreshToolbarPresentation();
  }
}

async function onHeartbeatAlarm(): Promise<void> {
  const auth = await getAuth();
  if (!auth || playingGameId == null || (await isPresenceInvisible())) {
    await stopPlaying();
    return;
  }
  const tab = await activeTab();
  const game = tab ? matchTabUrlToGame(tab.href) : null;
  if (!game || game.id !== playingGameId) {
    resetDwellSession();
    await stopPlaying();
    return;
  }
  await sendHeartbeat(auth, game);
}

async function ensureFeedAlarm(): Promise<void> {
  const auth = await getAuth();
  if (!auth) {
    try {
      await browser.alarms.clear(FEED_ALARM);
    } catch {
      /* ignore */
    }
    return;
  }
  const existing = await browser.alarms.get(FEED_ALARM);
  if (!existing) {
    await browser.alarms.create(FEED_ALARM, { periodInMinutes: 1, delayInMinutes: 1 });
  }
}

async function readFeedCache(): Promise<PopupFeedCache> {
  const stored = await browser.storage.local.get([POPUP_FEED_CACHE_STORAGE_KEY]);
  return coercePopupFeedCache(stored[POPUP_FEED_CACHE_STORAGE_KEY]);
}

async function writeFeedCache(next: PopupFeedCache): Promise<void> {
  await browser.storage.local.set({
    [POPUP_FEED_CACHE_STORAGE_KEY]: next,
  });
}

async function refreshFeedCache(force = false): Promise<void> {
  if (feedRefreshPromise) return feedRefreshPromise;

  feedRefreshPromise = (async () => {
    const auth = await getAuth();
    if (!auth) {
      friendsPlayingCount = null;
      try {
        await browser.alarms.clear(FEED_ALARM);
      } catch {
        /* ignore */
      }
      await writeFeedCache(emptyPopupFeedCache());
      await refreshToolbarPresentation();
      return;
    }

    const existing = await readFeedCache();
    if (
      !force &&
      existing.fetchedAt != null &&
      Date.now() - existing.fetchedAt < FEED_CACHE_MIN_REFRESH_MS
    ) {
      friendsPlayingCount = existing.entries.length;
      await refreshToolbarPresentation();
      return;
    }

    try {
      const client = new JamfulApiClient(auth.base, () => auth.token);
      const feed = sortFeedEntries(await client.getFeed());
      friendsPlayingCount = feed.length;
      await writeFeedCache({
        entries: feed,
        fetchedAt: Date.now(),
        error: null,
      });
    } catch (e) {
      console.warn("[jamful] feed fetch failed", e);
      if (friendsPlayingCount === null) {
        friendsPlayingCount = existing.entries.length;
      }
      await writeFeedCache({
        entries: existing.entries,
        fetchedAt: existing.fetchedAt,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    await refreshToolbarPresentation();
  })();

  try {
    await feedRefreshPromise;
  } finally {
    feedRefreshPromise = null;
  }
}

export default defineBackground(() => {
  void (async () => {
    await hydrateSelfPresence();
    await ensureFeedAlarm();
    await refreshFeedCache();
    if (await isPresenceInvisible()) {
      await enterInvisibleMode();
      return;
    }
    await syncPresence();
  })();

  browser.tabs.onUpdated.addListener((_id, info) => {
    if (info.status === "loading" || info.url != null) void syncPresence();
  });
  browser.tabs.onActivated.addListener(() => void syncPresence());
  browser.windows.onFocusChanged.addListener((w) => {
    if (w !== browser.windows.WINDOW_ID_NONE) void syncPresence();
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!changes.accessToken && !changes.presenceInvisible) return;
    if (changes.accessToken) {
      friendsPlayingCount =
        typeof changes.accessToken.newValue === "string" ? 0 : null;
      void ensureFeedAlarm();
      void refreshFeedCache(true);
    }
    if (changes.presenceInvisible?.newValue === true) {
      void enterInvisibleMode();
      return;
    }
    void syncPresence();
  });

  browser.alarms.onAlarm.addListener((a) => {
    if (a.name === HEARTBEAT_ALARM) void onHeartbeatAlarm();
    else if (a.name === FEED_ALARM) void refreshFeedCache();
  });

  browser.runtime.onMessage.addListener((message) => {
    if (
      !message ||
      typeof message !== "object" ||
      (message as { type?: unknown }).type !== REFRESH_FEED_MESSAGE_TYPE
    ) {
      return undefined;
    }

    return refreshFeedCache().then(() => ({ ok: true }));
  });
});
