import { JamfulApiClient } from "@jamful/extension-api";
import type { FeedEntry } from "@jamful/shared";

const DEFAULT_API = "http://127.0.0.1:8787";

async function getApiBase(): Promise<string> {
  const { apiBaseUrl } = await chrome.storage.local.get(["apiBaseUrl"]);
  return typeof apiBaseUrl === "string" && apiBaseUrl.length > 0 ? apiBaseUrl : DEFAULT_API;
}

async function loadToken(): Promise<string | null> {
  const { accessToken } = await chrome.storage.local.get(["accessToken"]);
  return typeof accessToken === "string" ? accessToken : null;
}

function render(
  root: HTMLElement,
  opts: {
    feed: FeedEntry[] | null;
    error: string | null;
    loggedIn: boolean;
    apiBase: string;
  },
): void {
  const { feed, error, loggedIn, apiBase } = opts;
  root.innerHTML = "";
  const apiRow = document.createElement("div");
  apiRow.className = "muted";
  apiRow.textContent = `API: ${apiBase}`;
  root.appendChild(apiRow);

  if (!loggedIn) {
    const f = document.createElement("div");
    f.innerHTML = `
      <label>API base URL<input id="api" type="text" value="${apiBase.replace(/"/g, "&quot;")}" /></label>
      <label>User id (dev)<input id="uid" type="text" placeholder="alice" /></label>
      <label>Display name<input id="dn" type="text" placeholder="Alice" /></label>
      <label>Following user ids (comma-separated)<input id="fol" type="text" placeholder="bob, carol" /></label>
      <button id="login" type="button">Sign in (dev)</button>
    `;
    root.appendChild(f);
    f.querySelector("#login")?.addEventListener("click", async () => {
      const api = (f.querySelector("#api") as HTMLInputElement).value.trim() || DEFAULT_API;
      const user_id = (f.querySelector("#uid") as HTMLInputElement).value.trim();
      const display_name = (f.querySelector("#dn") as HTMLInputElement).value.trim();
      const followingRaw = (f.querySelector("#fol") as HTMLInputElement).value;
      const following = followingRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!user_id || !display_name) {
        alert("user id and display name required");
        return;
      }
      await chrome.storage.local.set({ apiBaseUrl: api });
      const client = new JamfulApiClient(api, () => null);
      try {
        const res = await client.devAuth({ user_id, display_name, following });
        await chrome.storage.local.set({ accessToken: res.access_token });
        location.reload();
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e));
      }
    });
    return;
  }

  if (error) {
    const e = document.createElement("div");
    e.className = "err";
    e.textContent = error;
    root.appendChild(e);
  }

  if (feed === null) {
    root.appendChild(document.createTextNode("Loading feed…"));
    return;
  }

  if (feed.length === 0) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "No friends playing right now.";
    root.appendChild(p);
    return;
  }

  const ul = document.createElement("ul");
  for (const row of feed) {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${escapeHtml(row.friend.name)}</strong> — ${escapeHtml(row.game.name)}`;
    const a = document.createElement("a");
    a.href = row.game.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "Open";
    a.style.display = "block";
    a.style.marginTop = "4px";
    li.appendChild(a);
    ul.appendChild(li);
  }
  root.appendChild(ul);

  const out = document.createElement("button");
  out.type = "button";
  out.textContent = "Sign out";
  out.addEventListener("click", async () => {
    await chrome.storage.local.remove(["accessToken"]);
    location.reload();
  });
  root.appendChild(out);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function main(): Promise<void> {
  const root = document.getElementById("root");
  if (!root) return;

  const apiBase = await getApiBase();
  const token = await loadToken();
  const loggedIn = !!token;

  const client = new JamfulApiClient(apiBase, () => token ?? null);

  if (!loggedIn) {
    render(root, { feed: null, error: null, loggedIn: false, apiBase });
    return;
  }

  render(root, { feed: null, error: null, loggedIn: true, apiBase });
  try {
    const feed = await client.getFeed();
    render(root, { feed, error: null, loggedIn: true, apiBase });
  } catch (e) {
    render(root, {
      feed: [],
      error: e instanceof Error ? e.message : String(e),
      loggedIn: true,
      apiBase,
    });
  }
}

main();
