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

import { Avatar, AvatarFallback, AvatarImage } from "../../components/ui/avatar";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { ScrollArea } from "../../components/ui/scroll-area";
import { Separator } from "../../components/ui/separator";
import { ChevronDown, LogOut, Eye, EyeOff, Gamepad2, Play, ExternalLink } from "lucide-react";
import { cn } from "../../lib/utils";

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

function FriendRow({ entry }: { entry: FeedEntry }) {
  const gameName = entry.game.name || "Unknown game";

  return (
    <div className="flex items-center gap-2.5 px-2 py-1.5 hover:bg-accent/50 transition-colors group rounded-md">
      <div className="relative shrink-0">
        <Avatar className="h-7 w-7 border border-border/50">
          <AvatarImage src={entry.friend.avatar_url} alt={entry.friend.name} />
          <AvatarFallback className="bg-muted text-muted-foreground text-[10px]">
            {initialsForName(entry.friend.name)}
          </AvatarFallback>
        </Avatar>
        {entry.game.icon_url && (
          <img 
            src={entry.game.icon_url} 
            alt={gameName} 
            className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-sm border border-background bg-background object-cover" 
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-medium leading-none truncate">
            {entry.friend.name}
          </p>
        </div>
        <p className="text-[10px] text-muted-foreground truncate mt-0.5 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
          <span className="truncate">Playing <span className="font-medium text-foreground">{gameName}</span></span>
        </p>
      </div>
      <Button
        variant="secondary"
        size="icon"
        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
        onClick={() => void browser.tabs.create({ url: entry.game.url, active: true })}
        title={`Join ${entry.friend.name} in ${gameName}`}
      >
        <Play className="h-3 w-3 ml-0.5" />
      </Button>
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
    setVisibilityError(null);
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

  const playingNow = !presenceInvisible && isPopupSelfPresenceFresh(selfPresence);

  if (!loggedIn) {
    return (
      <main className="flex flex-col h-full bg-background text-foreground p-6">
        <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center">
            <Gamepad2 className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">Jamful</h1>
            <p className="text-muted-foreground text-sm max-w-[240px] mx-auto">
              See what your friends are playing and join them instantly.
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
              <p className="text-sm text-destructive font-medium">
                {authError ?? configError}
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col h-full bg-background text-foreground">
      <header className="px-3 py-2.5 flex items-center justify-between border-b border-border/50 shrink-0 bg-card">
        <div className="flex items-center gap-2.5">
          <Avatar className="h-8 w-8 border border-border/50">
            <AvatarFallback className="bg-primary/10 text-primary font-medium text-xs">
              {xUsername ? initialsForName(xUsername) : "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-xs font-semibold leading-none">
              {xUsername ? `@${xUsername}` : "User"}
            </span>
            <span className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full shrink-0",
                  presenceInvisible || !playingNow ? "bg-muted-foreground" : "bg-green-500"
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
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full">
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
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-green-500" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void handlePresenceInvisibleChange(true)}
              className="gap-2"
            >
              <EyeOff className="h-4 w-4" />
              <span>Invisible</span>
              {presenceInvisible && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-muted-foreground" />
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handleSignOut()} className="gap-2 text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {visibilityError && (
        <div className="px-4 py-2 bg-destructive/10 text-destructive text-xs font-medium border-b border-destructive/20">
          {visibilityError}
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="p-1.5">
          <div className="px-1.5 py-1 flex items-center justify-between mb-0.5">
            <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Friends Playing
            </h2>
            <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-px rounded-sm">
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
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                <Gamepad2 className="w-6 h-6 text-muted-foreground/50" />
              </div>
              <p className="text-sm font-medium text-foreground">
                {feedLoading ? "Loading friends..." : "No friends playing"}
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                {feedLoading
                  ? "Fetching latest activity"
                  : "When your friends start playing, they'll appear here."}
              </p>
            </div>
          )}
          {feedError && (
            <p className="text-xs text-destructive text-center mt-4 px-4">
              {feedError}
            </p>
          )}
        </div>
      </ScrollArea>
    </main>
  );
}
