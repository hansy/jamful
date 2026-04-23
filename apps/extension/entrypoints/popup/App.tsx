import { startTransition, useEffect, useEffectEvent, useState } from "react";
import type { FeedEntry } from "@jamful/shared";
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

function PresenceSummary({ selfPresence }: { selfPresence: PopupSelfPresence }) {
  const playingNow = isPopupSelfPresenceFresh(selfPresence);

  return (
    <div className="jamful-popup__presence">
      <span
        className={
          playingNow
            ? "jamful-popup__presenceBadge jamful-popup__presenceBadge--active"
            : "jamful-popup__presenceBadge"
        }
      >
        {playingNow ? "Playing now" : "Not playing right now"}
      </span>
      <p className="jamful-popup__presenceCopy">
        {playingNow && selfPresence.gameName
          ? `You're currently in ${selfPresence.gameName}.`
          : "Open a supported game tab and Jamful will share your presence after a short moment."}
      </p>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [xUsername, setXUsername] = useState<string | null>(null);
  const [selfPresence, setSelfPresence] = useState<PopupSelfPresence>(
    inactivePopupSelfPresence(),
  );
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  const apiBase = getConfiguredApiBaseOrNull();
  const configError = getConfiguredApiBaseError();
  const loggedIn = !!token;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = await browser.storage.local.get([
        "accessToken",
        "xUsername",
        POPUP_FEED_CACHE_STORAGE_KEY,
        POPUP_SELF_PRESENCE_STORAGE_KEY,
      ]);
      if (cancelled) return;
      setToken(typeof stored.accessToken === "string" ? stored.accessToken : null);
      setXUsername(typeof stored.xUsername === "string" ? stored.xUsername : null);
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
        xUsername: tokenRes.x_username,
      });
      setToken(tokenRes.access_token);
      setXUsername(tokenRes.x_username);
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
    setFeed([]);
    setFeedError(null);
    setFeedLoading(false);
    await browser.storage.local.set({
      [POPUP_FEED_CACHE_STORAGE_KEY]: emptyPopupFeedCache(),
    });
    setSelfPresence(inactivePopupSelfPresence());
  }

  return (
    <main className="jamful-popup">
      <header className="jamful-popup__masthead">
        <p className="jamful-popup__eyebrow">Jamful</p>
        <h1 className="jamful-popup__title">
          {loggedIn ? "Friends playing now" : "See who's playing"}
        </h1>
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
            <PresenceSummary selfPresence={selfPresence} />
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
