import type { Game } from "@jamful/shared";

export type PresenceState =
  | { kind: "idle" }
  | { kind: "detecting"; game: Game; since: number }
  | { kind: "playing"; game: Game; sessionStartedAt: number };

export type PresenceEvent =
  | { type: "entered_detecting"; game: Game }
  | { type: "started_playing"; game: Game }
  | { type: "stopped_playing"; reason: "tab_inactive" | "url_mismatch" | "navigation" }
  | { type: "noop" };

const DEFAULT_DWELL_MS = 8_000;

/** Normalize URL for prefix matching (lowercase origin + pathname, no hash). */
export function normalizeUrlForMatch(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin.toLowerCase()}${u.pathname.replace(/\/$/, "") || ""}`.toLowerCase();
  } catch {
    return "";
  }
}

/** True if tab URL is this game origin/path prefix (boundary-safe, not `a.com` vs `a.computer`). */
export function urlMatchesGameTab(tabUrl: string, gameUrl: string): boolean {
  const tab = normalizeUrlForMatch(tabUrl);
  const prefix = normalizeUrlForMatch(gameUrl);
  if (!tab || !prefix || !tab.startsWith(prefix)) return false;
  if (tab.length === prefix.length) return true;
  const next = tab[prefix.length];
  return next === "/" || next === "?";
}

/** Longest-prefix match: returns the game whose URL is the longest matching prefix of the tab URL. */
export function matchGame(tabUrl: string, games: Game[]): Game | null {
  const tab = normalizeUrlForMatch(tabUrl);
  if (!tab) return null;
  let best: Game | null = null;
  let bestLen = -1;
  for (const g of games) {
    if (!urlMatchesGameTab(tab, g.url)) continue;
    const prefix = normalizeUrlForMatch(g.url);
    if (prefix.length > bestLen) {
      bestLen = prefix.length;
      best = g;
    }
  }
  return best;
}

export class PresenceStateMachine {
  private state: PresenceState = { kind: "idle" };
  constructor(private readonly dwellMs: number = DEFAULT_DWELL_MS) {}

  getState(): PresenceState {
    return this.state;
  }

  /**
   * @param tabActive - focused window + active tab
   * @param now - monotonic or epoch ms
   */
  tick(opts: {
    tabActive: boolean;
    tabUrl: string | null;
    games: Game[];
    now: number;
  }): PresenceEvent {
    const { tabActive, tabUrl, games, now } = opts;
    const game = tabActive && tabUrl ? matchGame(tabUrl, games) : null;

    if (this.state.kind === "idle") {
      if (!game) return { type: "noop" };
      this.state = { kind: "detecting", game, since: now };
      return { type: "entered_detecting", game };
    }

    if (this.state.kind === "detecting") {
      if (!game || game.id !== this.state.game.id) {
        this.state = { kind: "idle" };
        return { type: "stopped_playing", reason: "url_mismatch" };
      }
      if (now - this.state.since >= this.dwellMs) {
        const g = this.state.game;
        this.state = { kind: "playing", game: g, sessionStartedAt: now };
        return { type: "started_playing", game: g };
      }
      return { type: "noop" };
    }

    // playing
    if (!tabActive || !tabUrl || !game || game.id !== this.state.game.id) {
      this.state = { kind: "idle" };
      return { type: "stopped_playing", reason: tabActive ? "url_mismatch" : "tab_inactive" };
    }
    return { type: "noop" };
  }

  reset(): void {
    this.state = { kind: "idle" };
  }
}

export const HEARTBEAT_INTERVAL_MS = 60_000;
export const NOTIFICATION_POLL_INTERVAL_MS = 60_000;
export const SESSION_EXPIRY_MS = 120_000;
