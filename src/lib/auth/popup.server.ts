/**
 * Live-preview sign-in popup — server-only (NEVER import from the client).
 */
import { auth, SESSION_TOKEN_COOKIE } from "./server";

type PopupMessage = {
  source: "grok-auth-popup";
  token: string | null;
  error?: string;
};

export async function handleAuthPopupRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const done = url.searchParams.get("done") === "1";

  if (done) {
    const errored = url.searchParams.has("error");
    const token = errored
      ? null
      : readSessionToken(request);
    const message: PopupMessage = {
      source: "grok-auth-popup",
      token,
      ...(errored
        ? { error: url.searchParams.get("error") ?? "sign_in_failed" }
        : !token
          ? { error: "session_cookie_missing" }
          : {}),
    };
    return new Response(completionHtml(message), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  }

  const providerId = url.searchParams.get("providerId")?.trim();
  if (!providerId) {
    return new Response("Missing providerId", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const back = `${url.origin}/auth/popup?done=1`;
  try {
    const apiRes = await auth.api.signInWithOAuth2({
      body: {
        providerId,
        callbackURL: back,
        errorCallbackURL: `${back}&error=1`,
      },
      headers: request.headers,
      asResponse: true,
    });

    if (!apiRes.ok) {
      const detail = await apiRes.text().catch(() => "");
      return completionResponse({
        source: "grok-auth-popup",
        token: null,
        error: detail || `oauth_init_failed_${apiRes.status}`,
      });
    }

    const body = (await apiRes.json().catch(() => null)) as {
      url?: string;
    } | null;
    const location = body?.url;
    if (!location) {
      return completionResponse({
        source: "grok-auth-popup",
        token: null,
        error: "oauth_init_missing_url",
      });
    }

    const headers = new Headers({ location, "cache-control": "no-store" });
    for (const cookie of apiRes.headers.getSetCookie()) {
      headers.append("set-cookie", cookie);
    }
    return new Response(null, { status: 302, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : "oauth_init_threw";
    return completionResponse({
      source: "grok-auth-popup",
      token: null,
      error: message,
    });
  }
}

function completionResponse(message: PopupMessage): Response {
  return new Response(completionHtml(message), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function completionHtml(message: PopupMessage): string {
  const payload = JSON.stringify(message).replace(/</g, "\\u003c");
  const ok = Boolean(message.token) && !message.error;
  return `<!doctype html>
<html lang="sk">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${ok ? "Prihlásený" : "Prihlásenie…"}</title>
<style>
  html,body{margin:0;min-height:100%;background:#141414;color:#e8e4de;
    font:15px/1.5 system-ui,-apple-system,sans-serif}
  main{min-height:100vh;display:grid;place-items:center;padding:1.5rem;text-align:center}
  p{max-width:22rem;margin:0 auto .75rem}
  .muted{color:#a39e96;font-size:13px}
  button{margin-top:1rem;padding:.7rem 1.2rem;border-radius:12px;border:0;
    background:#6b3f24;color:#fff;font-weight:600;cursor:pointer}
  button:hover{filter:brightness(1.08)}
</style>
</head>
<body>
<main>
  <p id="status">${ok ? "Hotovo — vraciame ťa do aplikácie…" : "Dokončujem prihlásenie…"}</p>
  <p class="muted" id="hint">Toto okno sa zatvorí samo.</p>
  <button type="button" id="continue" hidden>Pokračovať</button>
</main>
<script type="application/json" id="grok-auth-popup-msg">${payload}</script>
<script>
(function () {
  var el = document.getElementById("grok-auth-popup-msg");
  var msg = { source: "grok-auth-popup", token: null };
  try { if (el && el.textContent) msg = JSON.parse(el.textContent); } catch (e) {}
  function post() {
    try {
      if (window.opener) window.opener.postMessage(msg, window.location.origin);
    } catch (e) {}
  }
  post();
  setTimeout(post, 50);
  setTimeout(post, 200);
  setTimeout(post, 500);
  var btn = document.getElementById("continue");
  var status = document.getElementById("status");
  var hint = document.getElementById("hint");
  if (!msg.token) {
    status.textContent = "Prihlásenie sa nedokončilo.";
    hint.textContent = msg.error ? ("Kód: " + msg.error) : "Zatvor okno a skús znova.";
    btn.hidden = false;
    btn.textContent = "Zatvoriť";
    btn.onclick = function () { try { window.close(); } catch (e) {} };
  } else {
    setTimeout(function () {
      try { window.close(); } catch (e) {}
      // If browser blocks close, show manual continue
      setTimeout(function () {
        if (!window.closed) {
          hint.textContent = "Ak sa okno nezavrelo, klikni nižšie.";
          btn.hidden = false;
          btn.textContent = "Hotovo — zavrieť";
          btn.onclick = function () {
            post();
            try { window.close(); } catch (e) {}
          };
        }
      }, 400);
    }, 120);
  }
})();
</script>
</body>
</html>`;
}

/** Prefer configured cookie; fall back to common Better Auth names. */
function readSessionToken(request: Request): string | null {
  const names = [
    SESSION_TOKEN_COOKIE,
    "grok-auth.session_token",
    "better-auth.session_token",
    "__Secure-better-auth.session_token",
  ];
  for (const name of names) {
    const v = readCookie(request, name);
    if (v) return v;
  }
  return null;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) !== name) continue;
    const raw = trimmed.slice(eq + 1);
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}
