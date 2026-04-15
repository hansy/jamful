import { JamfulApiClient } from "@jamful/extension-api";
import {
  HEARTBEAT_INTERVAL_MS,
  NOTIFICATION_POLL_INTERVAL_MS,
  PresenceStateMachine,
} from "@jamful/extension-core";
import type { Game } from "@jamful/shared";

const machine = new PresenceStateMachine(8_000);
let cachedGames: Game[] = [];

const DWELL_ALARM = "jamful-dwell";
const HEARTBEAT_ALARM = "jamful-heartbeat";
const NOTIFY_ALARM = "jamful-notify";
const GAMES_ALARM = "jamful-games";

/** 1×1 PNG — `iconUrl` is required for `basic` notifications on some platforms; replace with a real asset later. */
const NOTIFICATION_ICON_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

function dwellDelayMinutes(): number {
  return 8 / 60;
}

function heartbeatPeriodMinutes(): number {
  return HEARTBEAT_INTERVAL_MS / 60_000;
}

function notifyPeriodMinutes(): number {
  return NOTIFICATION_POLL_INTERVAL_MS / 60_000;
}

async function getClient(): Promise<JamfulApiClient | null> {
  const { apiBaseUrl, accessToken } = await chrome.storage.local.get([
    "apiBaseUrl",
    "accessToken",
  ]);
  const base =
    typeof apiBaseUrl === "string" && apiBaseUrl.length > 0
      ? apiBaseUrl
      : "http://127.0.0.1:8787";
  const token = typeof accessToken === "string" ? accessToken : null;
  if (!token) return null;
  return new JamfulApiClient(base, () => token);
}

async function loadGamesFromCache(): Promise<void> {
  const { gamesCache } = await chrome.storage.local.get(["gamesCache"]);
  if (Array.isArray(gamesCache)) cachedGames = gamesCache as Game[];
}

async function refreshGames(): Promise<void> {
  const client = await getClient();
  if (!client) {
    await loadGamesFromCache();
    return;
  }
  try {
    cachedGames = await client.getGames();
    await chrome.storage.local.set({ gamesCache: cachedGames });
  } catch {
    await loadGamesFromCache();
  }
}

async function getActiveTab(): Promise<{ url: string | null; active: boolean }> {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const t = tabs[0];
  if (!t?.url) return { url: null, active: false };
  return { url: t.url, active: true };
}

function clearDwellAlarm(): void {
  void chrome.alarms.clear(DWELL_ALARM);
}

function scheduleDwellAlarm(): void {
  void chrome.alarms.create(DWELL_ALARM, { delayInMinutes: dwellDelayMinutes() });
}

function startHeartbeatAlarm(): void {
  void chrome.alarms.create(HEARTBEAT_ALARM, {
    delayInMinutes: heartbeatPeriodMinutes(),
    periodInMinutes: heartbeatPeriodMinutes(),
  });
}

function stopHeartbeatAlarm(): void {
  void chrome.alarms.clear(HEARTBEAT_ALARM);
}

async function sendHeartbeat(gameId: string): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    await client.heartbeat(gameId);
  } catch {
    /* offline */
  }
}

async function scan(): Promise<void> {
  const { url, active } = await getActiveTab();
  const now = Date.now();
  const ev = machine.tick({
    tabActive: active,
    tabUrl: url,
    games: cachedGames,
    now,
  });

  if (ev.type === "entered_detecting") {
    clearDwellAlarm();
    scheduleDwellAlarm();
  }

  if (ev.type === "stopped_playing") {
    clearDwellAlarm();
    stopHeartbeatAlarm();
  }

  if (ev.type === "started_playing") {
    clearDwellAlarm();
    stopHeartbeatAlarm();
    startHeartbeatAlarm();
    await sendHeartbeat(ev.game.id);
  }
}

async function pollNotifications(): Promise<void> {
  const client = await getClient();
  if (!client) return;
  const { lastNotificationCursor } = await chrome.storage.local.get(["lastNotificationCursor"]);
  const cursor =
    typeof lastNotificationCursor === "string" && lastNotificationCursor.length > 0
      ? lastNotificationCursor
      : null;
  try {
    const res = await client.getNotifications(cursor);
    for (const n of res.items) {
      await chrome.notifications.create(`jamful-${n.id}`, {
        type: "basic",
        iconUrl: NOTIFICATION_ICON_URL,
        title: "Jamful",
        message: "A friend started playing a game",
        silent: false,
      });
    }
    if (res.next_cursor) {
      await chrome.storage.local.set({ lastNotificationCursor: res.next_cursor });
    }
    if (res.items.length > 0) {
      await chrome.action.setBadgeBackgroundColor({ color: "#333" });
      await chrome.action.setBadgeText({ text: String(res.items.length) });
    }
  } catch {
    /* ignore */
  }
}

function ensureRepeatingAlarms(): void {
  void chrome.alarms.create(NOTIFY_ALARM, {
    delayInMinutes: notifyPeriodMinutes(),
    periodInMinutes: notifyPeriodMinutes(),
  });
  void chrome.alarms.create(GAMES_ALARM, {
    delayInMinutes: 5,
    periodInMinutes: 30,
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureRepeatingAlarms();
  void refreshGames();
});

chrome.runtime.onStartup.addListener(() => {
  ensureRepeatingAlarms();
  void refreshGames();
});

ensureRepeatingAlarms();

chrome.tabs.onActivated.addListener(() => {
  void scan();
});
chrome.tabs.onUpdated.addListener((_id, info) => {
  if (info.status === "loading" || info.url) void scan();
});
chrome.windows.onFocusChanged.addListener(() => {
  void scan();
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === DWELL_ALARM) void scan();
  if (a.name === HEARTBEAT_ALARM) {
    const s = machine.getState();
    if (s.kind === "playing") void sendHeartbeat(s.game.id);
  }
  if (a.name === NOTIFY_ALARM) void pollNotifications();
  if (a.name === GAMES_ALARM) void refreshGames();
});

void refreshGames();
void scan();

