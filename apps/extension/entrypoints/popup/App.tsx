import { useCallback, useEffect, useState } from "react";
import { browser } from "wxt/browser";
import { JamfulApiClient } from "@jamful/extension-api";
import { createPkcePair } from "./pkce";

const DEFAULT_API = "http://127.0.0.1:8787";

export default function App() {
  const [apiBase, setApiBase] = useState(DEFAULT_API);
  const [apiInput, setApiInput] = useState(DEFAULT_API);
  const [token, setToken] = useState<string | null>(null);
  const [xUsername, setXUsername] = useState<string | null>(null);
  const [redirectUrl, setRedirectUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  useEffect(() => {
    setRedirectUrl(browser.identity.getRedirectURL());
    void (async () => {
      const { apiBaseUrl, accessToken, xUsername: storedUser } =
        await browser.storage.local.get([
          "apiBaseUrl",
          "accessToken",
          "xUsername",
        ]);
      const base =
        typeof apiBaseUrl === "string" && apiBaseUrl.length > 0
          ? apiBaseUrl
          : DEFAULT_API;
      setApiBase(base);
      setApiInput(base);
      setToken(typeof accessToken === "string" ? accessToken : null);
      setXUsername(typeof storedUser === "string" ? storedUser : null);
    })();
  }, []);

  const loggedIn = !!token;

  const handleSignIn = useCallback(async () => {
    const api = apiInput.trim() || DEFAULT_API;
    await browser.storage.local.set({ apiBaseUrl: api });
    setApiBase(api);
    setError(null);
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
        setError("Sign-in was cancelled.");
        return;
      }
      const r = new URL(responseUrl);
      const err = r.searchParams.get("error");
      const desc = r.searchParams.get("error_description");
      if (err) {
        setError(`${err}${desc ? `: ${desc}` : ""}`);
        return;
      }
      if (r.searchParams.get("state") !== state) {
        setError("OAuth state mismatch; try again.");
        return;
      }
      const code = r.searchParams.get("code");
      if (!code) {
        setError("No authorization code returned.");
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoginBusy(false);
    }
  }, [apiInput]);

  const handleSignOut = useCallback(async () => {
    await browser.storage.local.remove(["accessToken", "xUsername"]);
    setToken(null);
    setXUsername(null);
    setError(null);
  }, []);

  return (
    <div className="jamful-popup">
      <h1 className="jamful-popup__title">Jamful</h1>
      <p className="jamful-popup__muted">Sign in with your X account.</p>

      {!loggedIn && (
        <div className="jamful-popup__section">
          <label className="jamful-popup__label">
            API base URL
            <input
              className="jamful-popup__input"
              type="text"
              value={apiInput}
              onChange={(e) => setApiInput(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <p className="jamful-popup__hint">
            Use your Jamful worker URL (local dev defaults to{" "}
            <code>{DEFAULT_API}</code>). Register this redirect in the X
            developer portal:
          </p>
          <p className="jamful-popup__redirect">{redirectUrl}</p>
          <button
            type="button"
            className="jamful-popup__button jamful-popup__button--primary"
            onClick={() => void handleSignIn()}
            disabled={loginBusy}
          >
            {loginBusy ? "Signing in…" : "Sign in with X"}
          </button>
        </div>
      )}

      {loggedIn && (
        <div className="jamful-popup__section">
          <p className="jamful-popup__success">
            Signed in{xUsername ? ` as @${xUsername}` : ""}.
          </p>
          <p className="jamful-popup__muted jamful-popup__truncate" title={apiBase}>
            API: {apiBase}
          </p>
          <button
            type="button"
            className="jamful-popup__button"
            onClick={() => void handleSignOut()}
          >
            Sign out
          </button>
        </div>
      )}

      {error && <p className="jamful-popup__error">{error}</p>}
    </div>
  );
}
