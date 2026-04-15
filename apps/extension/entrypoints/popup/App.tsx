import { useCallback, useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { JamfulApiClient } from "@jamful/extension-api";
import type { FeedEntry } from "@jamful/shared";
import { createPkcePair } from "./pkce";

const DEFAULT_API = "http://127.0.0.1:8787";

export default function App() {
  const [apiBase, setApiBase] = useState(DEFAULT_API);
  const [apiInput, setApiInput] = useState(DEFAULT_API);
  const [token, setToken] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState("");
  const [feed, setFeed] = useState<FeedEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  useEffect(() => {
    setRedirectUrl(browser.identity.getRedirectURL());
    void (async () => {
      const { apiBaseUrl } = await browser.storage.local.get(["apiBaseUrl"]);
      const { accessToken } = await browser.storage.local.get(["accessToken"]);
      const base =
        typeof apiBaseUrl === "string" && apiBaseUrl.length > 0 ? apiBaseUrl : DEFAULT_API;
      setApiBase(base);
      setApiInput(base);
      setToken(typeof accessToken === "string" ? accessToken : null);
    })();
  }, []);

  const loggedIn = !!token;

  useEffect(() => {
    if (!loggedIn || !token) {
      setFeed(null);
      setError(null);
      return;
    }
    const client = new JamfulApiClient(apiBase, () => token);
    let cancelled = false;
    setFeed(null);
    setError(null);
    void (async () => {
      try {
        const rows = await client.getFeed();
        if (!cancelled) setFeed(rows);
      } catch (e) {
        if (!cancelled) {
          setFeed([]);
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loggedIn, apiBase, token]);

  const handleSignIn = useCallback(async () => {
    const api = apiInput.trim() || DEFAULT_API;
    await browser.storage.local.set({ apiBaseUrl: api });
    setApiBase(api);
    setLoginBusy(true);
    const c = new JamfulApiClient(api, () => null);
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
        alert("Sign-in was cancelled.");
        return;
      }
      const r = new URL(responseUrl);
      const err = r.searchParams.get("error");
      const desc = r.searchParams.get("error_description");
      if (err) {
        alert(`${err}${desc ? `: ${desc}` : ""}`);
        return;
      }
      if (r.searchParams.get("state") !== state) {
        alert("OAuth state mismatch; try again.");
        return;
      }
      const code = r.searchParams.get("code");
      if (!code) {
        alert("No authorization code returned.");
        return;
      }
      const tokenRes = await c.exchangeXToken({
        code,
        code_verifier: verifier,
        redirect_uri,
      });
      await browser.storage.local.set({ accessToken: tokenRes.access_token });
      setToken(tokenRes.access_token);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setLoginBusy(false);
    }
  }, [apiInput]);

  const handleSignOut = useCallback(async () => {
    await browser.storage.local.remove(["accessToken"]);
    setToken(null);
    setFeed(null);
    setError(null);
  }, []);

  return (
    <div className="w-[360px] min-h-[200px] p-3 text-sm text-gray-900">
      <p className="text-xs text-gray-500">API: {apiBase}</p>

      {!loggedIn && (
        <div className="mt-2 space-y-2">
          <label className="block text-xs text-gray-600">
            API base URL
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              type="text"
              value={apiInput}
              onChange={(e) => setApiInput(e.target.value)}
            />
          </label>
          <p className="text-xs text-gray-500">
            Sign in uses X OAuth (PKCE). Register the redirect URL in the X developer portal (User
            authentication settings).
          </p>
          <p className="break-all text-[11px] text-gray-500">Redirect: {redirectUrl}</p>
          <button
            type="button"
            className="mt-2 rounded bg-gray-900 px-3 py-2 text-sm text-white hover:bg-gray-800 disabled:opacity-50"
            onClick={() => void handleSignIn()}
            disabled={loginBusy}
          >
            {loginBusy ? "…" : "Sign in with X"}
          </button>
        </div>
      )}

      {loggedIn && error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {loggedIn && feed === null && !error && (
        <p className="mt-2 text-gray-600">Loading feed…</p>
      )}

      {loggedIn && feed !== null && feed.length === 0 && !error && (
        <p className="mt-2 text-gray-500">No friends playing right now.</p>
      )}

      {loggedIn && feed !== null && feed.length > 0 && (
        <ul className="mt-3 list-none space-y-2 border-t border-gray-100 pt-2">
          {feed.map((row) => (
            <li key={row.session_id} className="border-b border-gray-100 pb-2 text-sm last:border-0">
              <div>
                <strong>{row.friend.name}</strong>
                <span className="text-gray-600"> — {row.game.name}</span>
              </div>
              <a
                className="mt-1 inline-block text-blue-600 hover:underline"
                href={row.game.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open
              </a>
            </li>
          ))}
        </ul>
      )}

      {loggedIn && (
        <button
          type="button"
          className="mt-4 rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          onClick={() => void handleSignOut()}
        >
          Sign out
        </button>
      )}
    </div>
  );
}
