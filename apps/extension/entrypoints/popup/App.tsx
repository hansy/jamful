import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import type { FeedEntry, GraphStatusResponse, GraphSyncStatus } from "@jamful/shared";
import { browser } from "wxt/browser";
import { JamfulApiClient } from "@jamful/extension-api";
import {
  POPUP_FEED_CACHE_STORAGE_KEY,
  REFRESH_FEED_MESSAGE_TYPE,
  coercePopupFeedCache,
  emptyPopupFeedCache,
} from "../../lib/feed-cache";
import {
  getConfiguredApiBaseError,
  getConfiguredApiBaseOrNull,
} from "../../lib/runtime-config";
import {
  POPUP_SELF_PRESENCE_EXPIRY_MS,
  POPUP_SELF_PRESENCE_STORAGE_KEY,
  coercePopupSelfPresence,
  inactivePopupSelfPresence,
  isPopupSelfPresenceFresh,
  type PopupSelfPresence,
} from "../../lib/self-presence";
import { createPkcePair } from "./pkce";

const FEED_REFRESH_MS = 60_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatTimestamp(value: number | null): string {
  if (value == null) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function graphStatusHeadline(status: GraphSyncStatus): string {
  switch (status) {
    case "queued":
      return "Sync queued";
    case "running":
      return "Syncing follows";
    case "succeeded":
      return "Graph is ready";
    case "failed":
      return "Sync failed";
    case "never":
    default:
      return "Graph not synced yet";
  }
}

function graphStatusCopy(status: GraphSyncStatus): string {
  switch (status) {
    case "queued":
      return "Jamful will refresh your followed players in the background.";
    case "running":
      return "We’re checking which people you follow are already in Jamful.";
    case "succeeded":
      return "Your followed Jamful players are up to date.";
    case "failed":
      return "Try resyncing again. If it keeps failing, sign out and reconnect X.";
    case "never":
    default:
      return "Run your first sync to discover which people you follow use Jamful.";
  }
}

function initialsForName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  const initials = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return initials || "?";
}

function FriendAvatar({ name, avatarUrl }: { name: string; avatarUrl: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = avatarUrl.length > 0 && !imageFailed;

  return (
    <span className="jamful-popup__avatar" aria-hidden="true">
      {showImage ? (
        <img
          className="jamful-popup__avatarImage"
          src={avatarUrl}
          alt=""
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="jamful-popup__avatarFallback">{initialsForName(name)}</span>
      )}
    </span>
  );
}

function FriendRow({ entry }: { entry: FeedEntry }) {
  const gameName = entry.game.name || "Unknown game";

  return (
    <li className="jamful-popup__friend">
      <FriendAvatar name={entry.friend.name} avatarUrl={entry.friend.avatar_url} />
      <div className="jamful-popup__friendCopy">
        <p className="jamful-popup__friendName">{entry.friend.name}</p>
        <p className="jamful-popup__friendMeta">Playing {gameName}</p>
      </div>
      <button
        type="button"
        className="jamful-popup__openGame"
        onClick={() => void browser.tabs.create({ url: entry.game.url, active: true })}
      >
        Open
      </button>
    </li>
  );
}

function PresenceSummary({
  selfPresence,
  presenceInvisible,
}: {
  selfPresence: PopupSelfPresence;
  presenceInvisible: boolean;
}) {
  const playingNow = !presenceInvisible && isPopupSelfPresenceFresh(selfPresence);
  const badgeClassName = playingNow
    ? "jamful-popup__presenceBadge jamful-popup__presenceBadge--active"
    : presenceInvisible
      ? "jamful-popup__presenceBadge jamful-popup__presenceBadge--invisible"
      : "jamful-popup__presenceBadge";

  return (
    <div className="jamful-popup__presence">
      <span className={badgeClassName}>
        {presenceInvisible ? "Invisible mode" : playingNow ? "Playing now" : "Not playing right now"}
      </span>
      <p className="jamful-popup__presenceCopy">
        {presenceInvisible
          ? "Your game activity is hidden until you turn visibility back on."
          : playingNow && selfPresence.gameName
            ? `You're currently in ${selfPresence.gameName}.`
            : "Open a supported game tab and Jamful will share your presence after a short moment."}
      </p>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [xUsername, setXUsername] = useState<string | null>(null);
  const [presenceInvisible, setPresenceInvisible] = useState(false);
  const [selfPresence, setSelfPresence] = useState<PopupSelfPresence>(
    inactivePopupSelfPresence(),
  );
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [visibilityError, setVisibilityError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [graphStatus, setGraphStatus] = useState<GraphStatusResponse | null>(null);
  const [graphSyncError, setGraphSyncError] = useState<string | null>(null);
  const [resyncBusy, setResyncBusy] = useState(false);
  const previousGraphStatusRef = useRef<GraphSyncStatus | null>(null);

  const apiBase = getConfiguredApiBaseOrNull();
  const configError = getConfiguredApiBaseError();
  const loggedIn = !!token;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = await browser.storage.local.get([
        "accessToken",
        "xUsername",
        "presenceInvisible",
        POPUP_FEED_CACHE_STORAGE_KEY,
        POPUP_SELF_PRESENCE_STORAGE_KEY,
      ]);
      if (cancelled) return;
      setToken(typeof stored.accessToken === "string" ? stored.accessToken : null);
      setXUsername(typeof stored.xUsername === "string" ? stored.xUsername : null);
      setPresenceInvisible(stored.presenceInvisible === true);
      const feedCache = coercePopupFeedCache(stored[POPUP_FEED_CACHE_STORAGE_KEY]);
      setFeed(feedCache.entries);
      setFeedError(feedCache.error);
      setSelfPresence(
        coercePopupSelfPresence(stored[POPUP_SELF_PRESENCE_STORAGE_KEY]),
      );
    })();

    function handleStorageChange(
      changes: Record<string, { newValue?: unknown }>,
      area: string,
    ): void {
      if (area !== "local") return;
      if (changes.accessToken) {
        setToken(
          typeof changes.accessToken.newValue === "string"
            ? changes.accessToken.newValue
            : null,
        );
      }
      if (changes.xUsername) {
        setXUsername(
          typeof changes.xUsername.newValue === "string"
            ? changes.xUsername.newValue
            : null,
        );
      }
      if (changes.presenceInvisible) {
        setPresenceInvisible(changes.presenceInvisible.newValue === true);
      }
      if (changes[POPUP_FEED_CACHE_STORAGE_KEY]) {
        const feedCache = coercePopupFeedCache(
          changes[POPUP_FEED_CACHE_STORAGE_KEY].newValue,
        );
        setFeed(feedCache.entries);
        setFeedError(feedCache.error);
        setFeedLoading(false);
      }
      if (changes[POPUP_SELF_PRESENCE_STORAGE_KEY]) {
        setSelfPresence(
          coercePopupSelfPresence(
            changes[POPUP_SELF_PRESENCE_STORAGE_KEY].newValue,
          ),
        );
      }
    }

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      cancelled = true;
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    if (!selfPresence.active || selfPresence.lastHeartbeatAt == null) return;
    const expiresAt = selfPresence.lastHeartbeatAt + POPUP_SELF_PRESENCE_EXPIRY_MS;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return;

    const timeout = window.setTimeout(() => {
      setSelfPresence((current) => ({ ...current }));
    }, remaining + 50);

    return () => window.clearTimeout(timeout);
  }, [selfPresence]);

  const refreshFeed = useEffectEvent(async () => {
    if (!token) return;
    if (!apiBase) {
      startTransition(() => {
        setFeedError(configError ?? "The Jamful API URL is not configured.");
      });
      return;
    }

    if (feed.length === 0) setFeedLoading(true);

    try {
      await browser.runtime.sendMessage({ type: REFRESH_FEED_MESSAGE_TYPE });
    } catch (error) {
      startTransition(() => {
        setFeedError(errorMessage(error));
      });
    } finally {
      setFeedLoading(false);
    }
  });

  const refreshGraphStatus = useEffectEvent(async () => {
    if (!token || !apiBase) return;

    try {
      const client = new JamfulApiClient(apiBase, () => token);
      const next = await client.getGraphStatus();
      const previous = previousGraphStatusRef.current;
      previousGraphStatusRef.current = next.status;
      setGraphStatus(next);
      setGraphSyncError(null);

      if (
        (previous === "queued" || previous === "running") &&
        next.status === "succeeded"
      ) {
        await browser.runtime.sendMessage({ type: REFRESH_FEED_MESSAGE_TYPE });
      }
    } catch (error) {
      setGraphSyncError(errorMessage(error));
    } finally {
      setResyncBusy(false);
    }
  });

  useEffect(() => {
    if (!loggedIn) {
      setFeed([]);
      setFeedError(null);
      setFeedLoading(false);
      return;
    }

    void refreshFeed();
    const interval = window.setInterval(() => void refreshFeed(), FEED_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [loggedIn, refreshFeed]);

  useEffect(() => {
    if (!loggedIn || !token || !apiBase) {
      setGraphStatus(null);
      setGraphSyncError(null);
      setResyncBusy(false);
      previousGraphStatusRef.current = null;
      return;
    }
    void refreshGraphStatus();
  }, [apiBase, loggedIn, refreshGraphStatus, token]);

  useEffect(() => {
    if (graphStatus?.status !== "queued" && graphStatus?.status !== "running") {
      return;
    }
    const interval = window.setInterval(() => void refreshGraphStatus(), 3000);
    return () => window.clearInterval(interval);
  }, [graphStatus?.status, refreshGraphStatus]);

  async function handleSignIn(): Promise<void> {
    if (!apiBase) {
      setAuthError(configError ?? "The Jamful API URL is not configured.");
      return;
    }

    setAuthError(null);
    setLoginBusy(true);
    const c = new JamfulApiClient(apiBase, () => null);
    const redirect_uri = browser.identity.getRedirectURL();
    const state = crypto.randomUUID();

    try {
      const { verifier, challenge } = await createPkcePair();
      const { authorization_url } = await c.getXAuthorizationUrl({
        code_challenge: challenge,
        state,
        redirect_uri,
      });
      const responseUrl = await browser.identity.launchWebAuthFlow({
        url: authorization_url,
        interactive: true,
      });
      if (!responseUrl) {
        setAuthError("Sign-in was cancelled.");
        return;
      }
      const r = new URL(responseUrl);
      const err = r.searchParams.get("error");
      const desc = r.searchParams.get("error_description");
      if (err) {
        setAuthError(`${err}${desc ? `: ${desc}` : ""}`);
        return;
      }
      if (r.searchParams.get("state") !== state) {
        setAuthError("OAuth state mismatch; try again.");
        return;
      }
      const code = r.searchParams.get("code");
      if (!code) {
        setAuthError("No authorization code returned.");
        return;
      }
      const tokenRes = await c.exchangeXToken({
        code,
        code_verifier: verifier,
        redirect_uri,
      });
      await browser.storage.local.set({
        accessToken: tokenRes.access_token,
        xUsername: tokenRes.user.x_username,
      });
      setToken(tokenRes.access_token);
      setXUsername(tokenRes.user.x_username);
      setGraphStatus({
        status: tokenRes.graph_sync.status,
        last_synced_at: tokenRes.graph_sync.last_synced_at,
        error_message: tokenRes.graph_sync.error_message,
        active_run: null,
        last_run: null,
      });
      previousGraphStatusRef.current = tokenRes.graph_sync.status;
      setGraphSyncError(tokenRes.graph_sync.error_message);
      setFeed([]);
      setFeedError(null);
    } catch (error) {
      setAuthError(errorMessage(error));
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleSignOut(): Promise<void> {
    await browser.storage.local.remove(["accessToken", "xUsername"]);
    setToken(null);
    setXUsername(null);
    setAuthError(null);
    setVisibilityError(null);
    setGraphStatus(null);
    setGraphSyncError(null);
    setResyncBusy(false);
    previousGraphStatusRef.current = null;
    setFeed([]);
    setFeedError(null);
    setFeedLoading(false);
    await browser.storage.local.set({
      [POPUP_FEED_CACHE_STORAGE_KEY]: emptyPopupFeedCache(),
    });
    setSelfPresence(inactivePopupSelfPresence());
  }

  async function handlePresenceInvisibleChange(next: boolean): Promise<void> {
    setPresenceInvisible(next);
    setVisibilityError(null);
    try {
      await browser.storage.local.set({ presenceInvisible: next });
    } catch (error) {
      setPresenceInvisible(!next);
      setVisibilityError(errorMessage(error));
    }
  }

  async function handleResync(): Promise<void> {
    if (!apiBase || !token) return;

    setGraphSyncError(null);
    setResyncBusy(true);
    try {
      const client = new JamfulApiClient(apiBase, () => token);
      const res = await client.resyncGraph();
      previousGraphStatusRef.current = res.status;
      await refreshGraphStatus();
    } catch (error) {
      setGraphSyncError(errorMessage(error));
      setResyncBusy(false);
    }
  }

  const syncInFlight =
    resyncBusy || graphStatus?.status === "queued" || graphStatus?.status === "running";
  const visibleGraphError = graphSyncError ?? graphStatus?.error_message ?? null;

  return (
    <main className="jamful-popup">
      <header className="jamful-popup__masthead">
        <p className="jamful-popup__eyebrow">Jamful</p>
        <div className="jamful-popup__header">
          <h1 className="jamful-popup__title">
            {loggedIn ? "Friends playing now" : "See who's playing"}
          </h1>
          {loggedIn && (
            <label className="jamful-popup__visibilityToggle">
              <input
                className="jamful-popup__visibilityInput"
                type="checkbox"
                checked={presenceInvisible}
                onChange={(event) =>
                  void handlePresenceInvisibleChange(event.currentTarget.checked)
                }
                aria-label="Go invisible"
              />
              <span className="jamful-popup__visibilityTrack" aria-hidden="true">
                <span className="jamful-popup__visibilityKnob" />
              </span>
              <span className="jamful-popup__visibilityText">
                {presenceInvisible ? "Invisible" : "Visible"}
              </span>
            </label>
          )}
        </div>
        {loggedIn && (
          <p className="jamful-popup__muted">
            {presenceInvisible
              ? "Invisible: your game activity is not shared."
              : "Visible: game activity can be shared with friends."}
          </p>
        )}
      </header>

      {!loggedIn ? (
        <section className="jamful-popup__auth">
          <p className="jamful-popup__muted">
            Sign in with X to see friends who are active in supported web games.
          </p>
          <button
            type="button"
            className="jamful-popup__button jamful-popup__button--primary"
            onClick={() => void handleSignIn()}
            disabled={loginBusy || !apiBase}
          >
            {loginBusy ? "Signing in..." : "Sign in with X"}
          </button>
          {(authError || configError) && (
            <p className="jamful-popup__error">{authError ?? configError}</p>
          )}
        </section>
      ) : (
        <>
          <section className="jamful-popup__account" aria-label="Account status">
            <div className="jamful-popup__accountTop">
              <div>
                <p className="jamful-popup__label">Authentication</p>
                <p className="jamful-popup__signedIn">
                  Signed in{xUsername ? ` as @${xUsername}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="jamful-popup__button jamful-popup__button--quiet"
                onClick={() => void handleSignOut()}
              >
                Sign out
              </button>
            </div>
            <div className="jamful-popup__sync">
              <div>
                <p className="jamful-popup__label">Follow graph</p>
                <p className="jamful-popup__syncHeadline">
                  {graphStatus ? graphStatusHeadline(graphStatus.status) : "Checking sync status"}
                </p>
                <p className="jamful-popup__syncMeta">
                  {graphStatus
                    ? graphStatus.status === "succeeded" && graphStatus.last_synced_at != null
                      ? `Last synced ${formatTimestamp(graphStatus.last_synced_at)}`
                      : graphStatusCopy(graphStatus.status)
                    : "Loading your sync state from the API."}
                </p>
              </div>
              <button
                type="button"
                className="jamful-popup__button jamful-popup__button--quiet"
                onClick={() => void handleResync()}
                disabled={syncInFlight}
              >
                {syncInFlight ? "Syncing..." : "Resync"}
              </button>
            </div>
            <PresenceSummary
              selfPresence={selfPresence}
              presenceInvisible={presenceInvisible}
            />
            {visibilityError && <p className="jamful-popup__error">{visibilityError}</p>}
            {visibleGraphError && <p className="jamful-popup__error">{visibleGraphError}</p>}
          </section>

          <section className="jamful-popup__feed" aria-label="Friends playing now">
            <div className="jamful-popup__feedHeader">
              <p className="jamful-popup__label">Friends</p>
              <span className="jamful-popup__count">
                {feed.length === 1 ? "1 active" : `${feed.length} active`}
              </span>
            </div>

            {feed.length > 0 ? (
              <ul className="jamful-popup__friendList">
                {feed.map((entry) => (
                  <FriendRow
                    key={`${entry.session_id}:${entry.friend.name}:${entry.game.url}`}
                    entry={entry}
                  />
                ))}
              </ul>
            ) : (
              <div className="jamful-popup__empty">
                <p>{feedLoading ? "Loading friends..." : "No friends are playing right now."}</p>
                <span>Open the popup later or start a game so friends can jump in.</span>
              </div>
            )}

            {feedError && <p className="jamful-popup__error">{feedError}</p>}
          </section>
        </>
      )}
    </main>
  );
}
