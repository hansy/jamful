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

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "../../components/ui/avatar";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { ScrollArea } from "../../components/ui/scroll-area";
import { ChevronDown, Eye, EyeOff, Gamepad2, LogOut, Play } from "lucide-react";
import { cn } from "../../lib/utils";

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
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const initials = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
  return initials || "?";
}

function avatarUrlFromAccessToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const [, payload] = token.split(".");
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded)) as { av?: unknown };
    return typeof parsed.av === "string" && parsed.av.length > 0
      ? parsed.av
      : null;
  } catch {
    return null;
  }
}

function FriendRow({ entry }: { entry: FeedEntry }) {
  const gameName = entry.game.name || "Unknown game";

  return (
    <div className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/50">
      <div className="relative shrink-0">
        <Avatar className="h-7 w-7">
          <AvatarImage src={entry.friend.avatar_url} alt={entry.friend.name} />
          <AvatarFallback className="bg-muted text-[10px] text-muted-foreground">
            {initialsForName(entry.friend.name)}
          </AvatarFallback>
        </Avatar>
        {entry.game.icon_url && (
          <img
            src={entry.game.icon_url}
            alt={gameName}
            className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-sm border border-background bg-background object-cover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium leading-none">
          {entry.friend.name}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-[10px] text-muted-foreground">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
          <span className="truncate">
            Playing <span className="font-medium text-foreground">{gameName}</span>
          </span>
        </p>
      </div>
      <Button
        variant="secondary"
        size="icon"
        className="h-6 w-6 shrink-0 rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus-visible:ring-0 focus-visible:ring-offset-0"
        onClick={() =>
          void browser.tabs.create({ url: entry.game.url, active: true })
        }
        title={`Join ${entry.friend.name} in ${gameName}`}
      >
        <Play className="ml-0.5 h-3 w-3" />
      </Button>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [xUsername, setXUsername] = useState<string | null>(null);
  const [xAvatarUrl, setXAvatarUrl] = useState<string | null>(null);
  const [presenceInvisible, setPresenceInvisible] = useState(false);
  const [selfPresence, setSelfPresence] = useState<PopupSelfPresence>(
    inactivePopupSelfPresence(),
  );
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const [feedFetchedAt, setFeedFetchedAt] = useState<number | null>(null);
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
        "xAvatarUrl",
        "presenceInvisible",
        POPUP_FEED_CACHE_STORAGE_KEY,
        POPUP_SELF_PRESENCE_STORAGE_KEY,
      ]);
      if (cancelled) return;
      const storedToken =
        typeof stored.accessToken === "string" ? stored.accessToken : null;
      setToken(storedToken);
      setXUsername(
        typeof stored.xUsername === "string" ? stored.xUsername : null,
      );
      setXAvatarUrl(
        typeof stored.xAvatarUrl === "string" && stored.xAvatarUrl.length > 0
          ? stored.xAvatarUrl
          : avatarUrlFromAccessToken(storedToken),
      );
      setPresenceInvisible(stored.presenceInvisible === true);
      const feedCache = coercePopupFeedCache(
        stored[POPUP_FEED_CACHE_STORAGE_KEY],
      );
      setFeed(feedCache.entries);
      setFeedFetchedAt(feedCache.fetchedAt);
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
        const nextToken =
          typeof changes.accessToken.newValue === "string"
            ? changes.accessToken.newValue
            : null;
        setToken(nextToken);
        if (!changes.xAvatarUrl) {
          setXAvatarUrl(avatarUrlFromAccessToken(nextToken));
        }
      }
      if (changes.xUsername) {
        setXUsername(
          typeof changes.xUsername.newValue === "string"
            ? changes.xUsername.newValue
            : null,
        );
      }
      if (changes.xAvatarUrl) {
        setXAvatarUrl(
          typeof changes.xAvatarUrl.newValue === "string" &&
            changes.xAvatarUrl.newValue.length > 0
            ? changes.xAvatarUrl.newValue
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
        setFeedFetchedAt(feedCache.fetchedAt);
        setFeedError(feedCache.error);
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
    const expiresAt =
      selfPresence.lastHeartbeatAt + POPUP_SELF_PRESENCE_EXPIRY_MS;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) return;

    const timeout = window.setTimeout(() => {
      setSelfPresence((current) => ({ ...current }));
    }, remaining + 50);

    return () => window.clearTimeout(timeout);
  }, [selfPresence]);

  const refreshFeed = useEffectEvent(() => {
    if (!token) return;
    if (!apiBase) {
      startTransition(() => {
        setFeedError(configError ?? "The Jamful API URL is not configured.");
      });
      return;
    }

    void browser.runtime
      .sendMessage({ type: REFRESH_FEED_MESSAGE_TYPE })
      .catch((error) => {
        startTransition(() => {
          setFeedError(errorMessage(error));
        });
      });
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
      setFeedFetchedAt(null);
      setFeedError(null);
      return;
    }

    void refreshFeed();
    const interval = window.setInterval(
      () => void refreshFeed(),
      FEED_REFRESH_MS,
    );
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
      const nextUsername = tokenRes.user.x_username || tokenRes.x_username;
      const nextAvatarUrl =
        tokenRes.avatar_url || tokenRes.user.avatar_url || avatarUrlFromAccessToken(tokenRes.access_token);
      await browser.storage.local.set({
        accessToken: tokenRes.access_token,
        xUsername: nextUsername,
        xAvatarUrl: nextAvatarUrl,
      });
      setToken(tokenRes.access_token);
      setXUsername(nextUsername);
      setXAvatarUrl(nextAvatarUrl);
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
      setFeedFetchedAt(null);
      setFeedError(null);
    } catch (error) {
      setAuthError(errorMessage(error));
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleSignOut(): Promise<void> {
    await browser.storage.local.remove([
      "accessToken",
      "xUsername",
      "xAvatarUrl",
    ]);
    setToken(null);
    setXUsername(null);
    setXAvatarUrl(null);
    setAuthError(null);
    setVisibilityError(null);
    setGraphStatus(null);
    setGraphSyncError(null);
    setResyncBusy(false);
    previousGraphStatusRef.current = null;
    setFeed([]);
    setFeedFetchedAt(null);
    setFeedError(null);
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

  const playingNow =
    !presenceInvisible && isPopupSelfPresenceFresh(selfPresence);
  const showInitialFeedLoading =
    loggedIn && feed.length === 0 && feedFetchedAt == null && feedError == null;
  const syncInFlight =
    resyncBusy ||
    graphStatus?.status === "queued" ||
    graphStatus?.status === "running";
  const visibleGraphError = graphSyncError ?? graphStatus?.error_message ?? null;

  if (!loggedIn) {
    return (
      <main className="flex h-full flex-col bg-background p-6 text-foreground">
        <div className="flex flex-1 flex-col items-center justify-center space-y-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Gamepad2 className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Jamful</h1>
            <p className="mx-auto max-w-[240px] text-sm text-muted-foreground">
              See what games the people you follow on X are playing.
            </p>
          </div>
          <div className="w-full space-y-3 pt-4">
            <Button
              className="w-full"
              size="lg"
              onClick={() => void handleSignIn()}
              disabled={loginBusy || !apiBase}
            >
              {loginBusy ? "Signing in..." : "Sign in with X"}
            </Button>
            {(authError || configError) && (
              <p className="text-sm font-medium text-destructive">
                {authError ?? configError}
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-full flex-col bg-background text-foreground">
      <header className="flex shrink-0 items-center justify-between border-b border-border/50 bg-card px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-8 w-8">
            <AvatarImage
              src={xAvatarUrl ?? undefined}
              alt={xUsername ?? "User"}
            />
            <AvatarFallback className="bg-primary/10 text-xs font-medium text-primary">
              {xUsername ? initialsForName(xUsername) : "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-xs font-semibold leading-none">
              {xUsername ? `@${xUsername}` : "User"}
            </span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  presenceInvisible || !playingNow
                    ? "bg-muted-foreground"
                    : "bg-green-500",
                )}
              />
              {presenceInvisible
                ? "Invisible"
                : playingNow && selfPresence.gameName
                  ? `Playing ${selfPresence.gameName}`
                  : "Not playing anything"}
            </span>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={() => void handlePresenceInvisibleChange(false)}
              className="gap-2"
            >
              <Eye className="h-4 w-4" />
              <span>Online</span>
              {!presenceInvisible && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-green-500" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void handlePresenceInvisibleChange(true)}
              className="gap-2"
            >
              <EyeOff className="h-4 w-4" />
              <span>Invisible</span>
              {presenceInvisible && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-muted-foreground" />
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => void handleSignOut()}
              className="gap-2 text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <ScrollArea className="flex-1">
        <div className="space-y-1.5 p-1.5">
          {(visibilityError || graphStatus || visibleGraphError) && (
            <section className="space-y-1.5 px-1.5 pt-1">
              {visibilityError && (
                <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                  {visibilityError}
                </div>
              )}
              <div className="rounded-lg border border-border/60 bg-card px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Follow graph
                    </p>
                    <p className="mt-1 text-xs font-semibold text-foreground">
                      {graphStatus
                        ? graphStatusHeadline(graphStatus.status)
                        : "Checking sync status"}
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                      {graphStatus
                        ? graphStatus.status === "succeeded" &&
                          graphStatus.last_synced_at != null
                          ? `Last synced ${formatTimestamp(graphStatus.last_synced_at)}`
                          : graphStatusCopy(graphStatus.status)
                        : "Loading your sync state from the API."}
                    </p>
                    {visibleGraphError && (
                      <p className="mt-1.5 text-[11px] leading-4 text-destructive">
                        {visibleGraphError}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={() => void handleResync()}
                    disabled={!apiBase || syncInFlight}
                  >
                    {syncInFlight ? "Syncing..." : "Resync"}
                  </Button>
                </div>
              </div>
            </section>
          )}

          <div className="mb-0.5 flex items-center justify-between px-1.5 py-1">
            <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              People you follow
            </h2>
            <span className="rounded-sm bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
              {feed.length}
            </span>
          </div>

          {feed.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {feed.map((entry) => (
                <FriendRow
                  key={`${entry.session_id}:${entry.friend.name}:${entry.game.url}`}
                  entry={entry}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Gamepad2 className="h-6 w-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {showInitialFeedLoading
                  ? "Loading list..."
                  : syncInFlight
                    ? "Syncing follows..."
                    : "Nobody is playing right now"}
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {syncInFlight
                  ? "New matches will appear after the follow graph refresh finishes."
                  : "Open the popup later to check again."}
              </p>
            </div>
          )}
          {feedError && (
            <p className="mt-4 px-4 text-center text-xs text-destructive">
              {feedError}
            </p>
          )}
        </div>
      </ScrollArea>
    </main>
  );
}
