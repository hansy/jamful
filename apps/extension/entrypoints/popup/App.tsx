import { startTransition, useEffect, useEffectEvent, useState } from "react";
import type { DirectoryUser, FeedEntry } from "@jamful/shared";
import { browser } from "wxt/browser";
import { JamfulApiClient } from "@jamful/extension-api";
import {
  POPUP_FEED_CACHE_STORAGE_KEY,
  REFRESH_FEED_MESSAGE_TYPE,
  coercePopupFeedCache,
  emptyPopupFeedCache,
} from "../../lib/feed-cache";
import {
  DEV_MOCK_CURRENT_USER_PRESENCE,
  DEV_MOCK_FEED_ENTRIES,
} from "../../lib/dev-mock-feed";
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
  sanitizeServerMessage,
  userFriendlyConfigError,
  userFriendlyError,
  userFriendlyOAuthError,
} from "../../lib/user-facing-errors";

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
import {
  ChevronDown,
  Eye,
  EyeOff,
  Gamepad2,
  LogOut,
  Play,
  RefreshCw,
  Search,
  UserCheck,
  Users,
} from "lucide-react";
import { cn } from "../../lib/utils";

const FEED_REFRESH_MS = 60_000;
const DIRECTORY_SEARCH_DEBOUNCE_MS = 250;
const DIRECTORY_SEARCH_MIN_CHARS = 3;

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
    <div className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent/50">
      <div className="relative shrink-0">
        <Avatar className="h-8 w-8">
          <AvatarImage src={entry.friend.avatar_url} alt={entry.friend.name} />
          <AvatarFallback className="bg-muted text-[10px] text-muted-foreground">
            {initialsForName(entry.friend.name)}
          </AvatarFallback>
        </Avatar>
        {entry.game.icon_url && (
          <img
            src={entry.game.icon_url}
            alt={gameName}
            className="absolute -bottom-1 -right-1 h-4 w-4 rounded-sm border border-background bg-background object-cover"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-none">
          {entry.friend.name}
        </p>
        <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
          <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
          <span className="truncate leading-none">
            Playing{" "}
            <span className="font-medium text-foreground">{gameName}</span>
          </span>
        </p>
      </div>
      <Button
        variant="secondary"
        size="icon"
        className="h-7 w-7 shrink-0 rounded-full focus-visible:ring-0 focus-visible:ring-offset-0"
        onClick={() =>
          void browser.tabs.create({ url: entry.game.url, active: true })
        }
        title={`Join ${entry.friend.name} in ${gameName}`}
      >
        <Play className="ml-0.5 h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function DirectoryRow({
  user,
  busy,
  onToggle,
}: {
  user: DirectoryUser;
  busy: boolean;
  onToggle: (user: DirectoryUser) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2.5 py-2 transition-colors hover:bg-accent/50">
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarImage src={user.avatar_url} alt={user.name} />
        <AvatarFallback className="bg-muted text-[10px] text-muted-foreground">
          {initialsForName(user.name || user.x_username)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-none">
          {user.name || `@${user.x_username}`}
        </p>
        <p className="mt-1 truncate text-[11px] leading-none text-muted-foreground">
          @{user.x_username}
        </p>
      </div>
      <Button
        variant={user.is_following ? "secondary" : "default"}
        size="sm"
        className="h-7 shrink-0 gap-1.5 rounded-md px-2.5 text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
        onClick={() => onToggle(user)}
        disabled={busy}
        title={
          user.is_following ? `Unfollow ${user.name}` : `Follow ${user.name}`
        }
      >
        {user.is_following ? (
          <>
            <span>Following</span>
            <UserCheck className="h-3.5 w-3.5" />
          </>
        ) : (
          <span>Follow</span>
        )}
      </Button>
    </div>
  );
}

const DEV_MOCK_DIRECTORY_USERS: DirectoryUser[] = [
  {
    id: "mock_user_laxbrownie",
    x_username: "laxbrownie",
    name: "Hans",
    avatar_url: DEV_MOCK_CURRENT_USER_PRESENCE.user.avatar_url,
    is_following: false,
  },
  {
    id: "mock_user_levelsio",
    x_username: "levelsio",
    name: "Pieter Levels",
    avatar_url:
      "https://pbs.twimg.com/profile_images/1996831016720486400/vycHz0uG_normal.jpg",
    is_following: true,
  },
  {
    id: "mock_user_marclou",
    x_username: "marclou",
    name: "Marc Lou",
    avatar_url:
      "https://pbs.twimg.com/profile_images/1514863683574599681/9k7PqDTA_normal.jpg",
    is_following: false,
  },
];

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
  const [activeTab, setActiveTab] = useState<"activity" | "discover">(
    "activity",
  );
  const [directoryUsers, setDirectoryUsers] = useState<DirectoryUser[]>([]);
  const [directoryQuery, setDirectoryQuery] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [directoryBusyUserId, setDirectoryBusyUserId] = useState<string | null>(
    null,
  );

  const apiBase = getConfiguredApiBaseOrNull();
  const configError = getConfiguredApiBaseError();
  const visibleConfigError = userFriendlyConfigError(configError);
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
      setFeedError(
        sanitizeServerMessage(
          feedCache.error,
          "Jamful couldn't refresh the activity list. Try again shortly.",
        ),
      );
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
        setFeedError(
          sanitizeServerMessage(
            feedCache.error,
            "Jamful couldn't refresh the activity list. Try again shortly.",
          ),
        );
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
        setFeedError(
          visibleConfigError ?? "Jamful isn't ready yet. Try again shortly.",
        );
      });
      return;
    }

    void browser.runtime
      .sendMessage({ type: REFRESH_FEED_MESSAGE_TYPE })
      .catch((error) => {
        startTransition(() => {
          setFeedError(
            userFriendlyError(
              error,
              "Jamful couldn't refresh the activity list. Try again shortly.",
            ),
          );
        });
      });
  });

  const refreshDirectory = useEffectEvent(async (query = directoryQuery) => {
    if (!token || !apiBase) return;

    setDirectoryLoading(true);
    try {
      const client = new JamfulApiClient(apiBase, () => token);
      const next = await client.getDirectoryUsers(query);
      setDirectoryUsers(next.users);
      setDirectoryError(null);
    } catch (error) {
      setDirectoryError(
        userFriendlyError(
          error,
          "Jamful couldn't load people right now. Try again shortly.",
        ),
      );
    } finally {
      setDirectoryLoading(false);
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
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn || !token || !apiBase) {
      setDirectoryUsers([]);
      setDirectoryError(null);
      setDirectoryLoading(false);
      return;
    }
    void refreshDirectory("");
  }, [apiBase, loggedIn, token]);

  useEffect(() => {
    if (!loggedIn || !token || !apiBase) return;
    if (directoryQuery.trim().replace(/^@/, "").length < DIRECTORY_SEARCH_MIN_CHARS) {
      setDirectoryUsers([]);
      setDirectoryError(null);
      setDirectoryLoading(false);
      return;
    }
    const timeout = window.setTimeout(() => {
      void refreshDirectory(directoryQuery);
    }, DIRECTORY_SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [apiBase, directoryQuery, loggedIn, token]);

  async function handleSignIn(): Promise<void> {
    if (!apiBase) {
      setAuthError(
        visibleConfigError ?? "Jamful isn't ready for sign-in right now.",
      );
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
      if (err) {
        setAuthError(userFriendlyOAuthError(err));
        return;
      }
      if (r.searchParams.get("state") !== state) {
        setAuthError("Jamful couldn't verify the sign-in. Try again.");
        return;
      }
      const code = r.searchParams.get("code");
      if (!code) {
        setAuthError("Jamful couldn't finish signing you in. Try again.");
        return;
      }
      const tokenRes = await c.exchangeXToken({
        code,
        code_verifier: verifier,
        redirect_uri,
      });
      const nextUsername = tokenRes.user.x_username || tokenRes.x_username;
      const nextAvatarUrl =
        tokenRes.avatar_url ||
        tokenRes.user.avatar_url ||
        avatarUrlFromAccessToken(tokenRes.access_token);
      await browser.storage.local.set({
        accessToken: tokenRes.access_token,
        xUsername: nextUsername,
        xAvatarUrl: nextAvatarUrl,
      });
      setToken(tokenRes.access_token);
      setXUsername(nextUsername);
      setXAvatarUrl(nextAvatarUrl);
      setFeed([]);
      setFeedFetchedAt(null);
      setFeedError(null);
    } catch (error) {
      setAuthError(
        userFriendlyError(
          error,
          "Jamful couldn't finish signing you in. Try again.",
        ),
      );
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
    setDirectoryUsers([]);
    setDirectoryQuery("");
    setDirectoryError(null);
    setDirectoryLoading(false);
    setDirectoryBusyUserId(null);
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
      setVisibilityError(
        userFriendlyError(
          error,
          "Jamful couldn't update your visibility setting. Try again.",
        ),
      );
    }
  }

  async function handleToggleFollow(user: DirectoryUser): Promise<void> {
    if (!apiBase || !token) return;

    if (user.id.startsWith("mock_user_")) {
      setDirectoryUsers((current) =>
        current.length > 0
          ? current
          : mockDirectoryUsers.map((row) =>
              row.id === user.id
                ? { ...row, is_following: !row.is_following }
                : row,
            ),
      );
      return;
    }

    setDirectoryError(null);
    setDirectoryBusyUserId(user.id);
    try {
      const client = new JamfulApiClient(apiBase, () => token);
      if (user.is_following) {
        await client.unfollowUser(user.id);
      } else {
        await client.followUser(user.id);
      }
      setDirectoryUsers((current) =>
        current.map((row) =>
          row.id === user.id
            ? { ...row, is_following: !row.is_following }
            : row,
        ),
      );
      await browser.runtime.sendMessage({ type: REFRESH_FEED_MESSAGE_TYPE });
    } catch (error) {
      setDirectoryError(
        userFriendlyError(
          error,
          "Jamful couldn't update that follow. Try again.",
        ),
      );
    } finally {
      setDirectoryBusyUserId(null);
    }
  }

  const playingNow =
    !presenceInvisible && isPopupSelfPresenceFresh(selfPresence);
  const showInitialFeedLoading =
    loggedIn && feed.length === 0 && feedFetchedAt == null && feedError == null;
  const emptyStateTitle = showInitialFeedLoading
    ? "Loading list..."
    : "Nobody is playing right now";
  const emptyStateCopy = "";
  const showMockFeedPreview =
    import.meta.env.DEV && feed.length === 0 && !showInitialFeedLoading;
  const visibleFeed = showMockFeedPreview ? DEV_MOCK_FEED_ENTRIES : feed;
  const trimmedDirectoryQuery = directoryQuery.trim().replace(/^@/, "");
  const showDirectoryPrompt =
    trimmedDirectoryQuery.length < DIRECTORY_SEARCH_MIN_CHARS;
  const mockDirectoryUsers =
    import.meta.env.DEV && !showDirectoryPrompt && directoryUsers.length === 0
      ? DEV_MOCK_DIRECTORY_USERS.filter((user) => {
          const q = trimmedDirectoryQuery.toLowerCase();
          return (
            user.x_username.toLowerCase().includes(q) ||
            user.name.toLowerCase().includes(q)
          );
        })
      : [];
  const visibleDirectoryUsers =
    directoryUsers.length > 0 ? directoryUsers : mockDirectoryUsers;

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
              See what games people you follow on Jamful are playing.
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
            {(authError || visibleConfigError) && (
              <p className="text-sm font-medium text-destructive">
                {authError ?? visibleConfigError}
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

      <div className="grid shrink-0 grid-cols-2 border-b border-border/50 bg-card p-1">
        <Button
          variant={activeTab === "activity" ? "secondary" : "ghost"}
          size="sm"
          className="h-8 rounded-md text-xs"
          onClick={() => setActiveTab("activity")}
        >
          Activity
        </Button>
        <Button
          variant={activeTab === "discover" ? "secondary" : "ghost"}
          size="sm"
          className="h-8 rounded-md text-xs"
          onClick={() => setActiveTab("discover")}
        >
          Discover
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1.5 p-1.5">
          {visibilityError && (
            <section className="px-1.5 pt-1">
              <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {visibilityError}
              </div>
            </section>
          )}

          {activeTab === "activity" ? (
            <>
              <div className="mb-0.5 flex items-center justify-between px-1.5 py-1">
                <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  People you follow
                </h2>
                <span className="rounded-sm bg-muted px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
                  {visibleFeed.length}
                </span>
              </div>

              {visibleFeed.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {visibleFeed.map((entry) => (
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
                    {emptyStateTitle}
                  </p>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    {emptyStateCopy}
                  </p>
                </div>
              )}
              {feedError && (
                <p className="mt-4 px-4 text-center text-xs text-destructive">
                  {feedError}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="px-1.5 py-1">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={directoryQuery}
                    onChange={(event) => setDirectoryQuery(event.target.value)}
                    placeholder="Search X handles"
                    className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-8 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                  {directoryLoading && (
                    <RefreshCw className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </label>
              </div>
              <div className="mb-0.5 flex items-center px-1.5 py-1">
                <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Jamful users
                </h2>
              </div>
              {visibleDirectoryUsers.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {visibleDirectoryUsers.map((user) => (
                    <DirectoryRow
                      key={user.id}
                      user={user}
                      busy={directoryBusyUserId === user.id}
                      onToggle={(next) => void handleToggleFollow(next)}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Users className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {directoryLoading
                      ? "Loading users..."
                      : showDirectoryPrompt
                        ? "Search for Jamful users by X handle"
                        : "No users found"}
                  </p>
                </div>
              )}
              {directoryError && (
                <p className="mt-4 px-4 text-center text-xs text-destructive">
                  {directoryError}
                </p>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </main>
  );
}
