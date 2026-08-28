import { genericOAuthClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { GROK_PROVIDERS } from "./providers";
import { authEnabledResolved } from "./mode";

/**
 * Better Auth client for this React SPA (browser-side).
 *
 * Talks to this app's OWN Better Auth at same-origin `/api/auth/*`. In the live
 * preview the app is an embedded iframe with PARTITIONED cookies, so after a
 * popup sign-in it can't read the session cookie — it authenticates with a
 * bearer token instead (captured from the popup, see `signIn`). The `onRequest`
 * hook attaches that token when present; when deployed (cookie auth) no token
 * is stored, so nothing changes.
 */
export const authClient = createAuthClient({
  plugins: [genericOAuthClient()],
  fetchOptions: {
    onRequest(ctx) {
      const token = getBearerToken();
      if (token) ctx.headers.set("Authorization", `Bearer ${token}`);
      return ctx;
    },
  },
});

/**
 * True when sign-in UI should be shown. On by default (preview via the baked
 * preview client, deployed apps via the injected per-app client); set
 * `VITE_AUTH_ENABLED=false` to force it off (dev user — see `use-current-user`).
 */
export const authEnabled = authEnabledResolved("client");

/** The upstream providers to render sign-in buttons for. */
export { GROK_PROVIDERS };

// ── Live-preview bearer token ────────────────────────────────────────────────
const BEARER_KEY = "grok-auth.bearer-token";

/** The stored preview bearer token, or null. */
export function getBearerToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(BEARER_KEY);
  } catch {
    return null;
  }
}

function setBearerToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) window.sessionStorage.setItem(BEARER_KEY, token);
    else window.sessionStorage.removeItem(BEARER_KEY);
  } catch {
    /* storage unavailable — ignore */
  }
}

/**
 * Sandbox live preview hosts (iframe + dynamic subdomains).
 * Matches `*.grok-sandbox.com` and nested hades hosts.
 */
function inLivePreview(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return (
    host.endsWith(".grok-sandbox.com") ||
    host.endsWith(".grok-sandbox.net") ||
    // Embedded preview may be framed even on loopback in some harnesses
    (window.parent !== window && host.includes("grok"))
  );
}

/** Message the popup posts back to the opener once sign-in completes. */
type PopupMessage = {
  source: "grok-auth-popup";
  token: string | null;
  error?: string;
};

function normalizeCallbackURL(url: string): string {
  if (!url) return "/studio";
  // Only same-origin relative paths — block open redirects
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin === window.location.origin) {
      return `${u.pathname}${u.search}${u.hash}`;
    }
  } catch {
    /* fall through */
  }
  return "/studio";
}

function hardNavigate(to: string) {
  const dest = normalizeCallbackURL(to);
  // Always leave /login after success — never await hanging session fetches first.
  try {
    window.location.assign(dest);
  } catch {
    window.location.href = dest;
  }
}

/**
 * Start sign-in with one upstream provider (`providerId` from `GROK_PROVIDERS`),
 * federating through the Grok auth broker.
 */
export async function signIn(
  providerId: string,
  opts: { callbackURL?: string; errorCallbackURL?: string } = {},
): Promise<void> {
  const callbackURL = normalizeCallbackURL(opts.callbackURL ?? "/studio");
  const errorCallbackURL = normalizeCallbackURL(
    opts.errorCallbackURL ?? "/login",
  );

  // Open the popup SYNCHRONOUSLY on the user gesture — before any await.
  const popup = inLivePreview() ? openSignInPopup(providerId) : null;

  const hadBearer = Boolean(getBearerToken());
  if (hadBearer || !inLivePreview()) {
    try {
      await authClient.signOut();
    } catch {
      // No active session — proceed.
    }
  }
  setBearerToken(null);

  if (inLivePreview()) {
    if (!popup) {
      throw new Error(
        "Pop-up bol zablokovaný. Povoľ pop-upy pre túto stránku a skús znova.",
      );
    }
    const result = await waitForPopupToken(popup);
    if (result.error && !result.token) {
      throw new Error(result.error);
    }
    if (!result.token) {
      throw new Error(
        "Prihlásenie sa nepodarilo dokončiť (prázdny token). Skús znova alebo iný účet.",
      );
    }
    setBearerToken(result.token);

    // Warm session in background — DO NOT block redirect (this was the hang).
    void Promise.race([
      authClient.getSession().catch(() => null),
      new Promise((r) => setTimeout(r, 1500)),
    ]);

    hardNavigate(callbackURL);
    return;
  }

  const { data, error } = await authClient.signIn.oauth2({
    providerId,
    callbackURL,
    errorCallbackURL,
  });
  if (error) throw new Error(error.message ?? "Sign-in failed");
  if (data?.url) window.location.href = data.url;
  else hardNavigate(callbackURL);
}

function openSignInPopup(providerId: string): Window | null {
  const origin = window.location.origin;
  const url = `${origin}/auth/popup?providerId=${encodeURIComponent(providerId)}`;
  const name = `grok-signin-${Date.now()}`;
  return window.open(url, name, "popup,width=520,height=700");
}

function waitForPopupToken(
  popup: Window,
): Promise<{ token: string | null; error?: string }> {
  return new Promise((resolve) => {
    const origin = window.location.origin;
    let settled = false;
    let closeTimer: number | undefined;
    const settle = (token: string | null, error?: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ token, error });
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== origin) return;
      const data = event.data as PopupMessage | undefined;
      if (!data || data.source !== "grok-auth-popup") return;
      settle(data.token ?? null, data.error);
    };
    const pollTimer = window.setInterval(() => {
      if (!popup.closed) return;
      window.clearInterval(pollTimer);
      // Grace for late postMessage
      closeTimer = window.setTimeout(
        () => settle(null, "Popup sa zatvoril bez dokončenia prihlásenia"),
        500,
      );
    }, 250);
    // Hard timeout — never hang forever
    const hardTimer = window.setTimeout(() => {
      try {
        popup.close();
      } catch {
        /* ignore */
      }
      settle(null, "Prihlásenie vypršalo (timeout). Skús znova.");
    }, 5 * 60_000);

    function cleanup() {
      window.clearInterval(pollTimer);
      window.clearTimeout(hardTimer);
      if (closeTimer !== undefined) window.clearTimeout(closeTimer);
      window.removeEventListener("message", onMessage);
    }
    window.addEventListener("message", onMessage);
  });
}

/** Sign out of THIS app's local session, clear the preview token, then redirect. */
export async function signOut(redirectTo = "/"): Promise<void> {
  try {
    const { resolveAuthProvider } = await import("./mode");
    if (resolveAuthProvider("client") === "supabase") {
      const { signOutSupabase } = await import("./supabase-browser");
      await signOutSupabase();
    } else {
      await authClient.signOut();
    }
  } finally {
    setBearerToken(null);
  }
  hardNavigate(redirectTo);
}
