/* Cozy AI Studio Service Worker — production shell (cozy-v2)
 * Strategies:
 *  - App shell (HTML/JS/CSS/fonts/icons): stale-while-revalidate
 *  - /api/* (except auth): network-first (3.5s) → cache fallback
 *  - /api/auth/* : network-only (never cache session/cookies)
 *  - preview / blob / webcontainer / ws / rtc : network-only
 *  - offline fallback → /offline.html
 */
const CACHE_VERSION = "cozy-v2";
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const API_CACHE = `${CACHE_VERSION}-api`;

const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/site.webmanifest",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/favicon-32x32.png",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (k) =>
                (k.startsWith("cosy-") || k.startsWith("cozy-")) &&
                k !== SHELL_CACHE &&
                k !== API_CACHE,
            )
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isApi(url) {
  return url.pathname.startsWith("/api/");
}

function isAuthApi(url) {
  return url.pathname.startsWith("/api/auth");
}

function isNeverCache(url) {
  const p = url.pathname;
  return (
    p.includes("webcontainer") ||
    p.includes("preview-runtime") ||
    p.startsWith("/api/ws") ||
    p.startsWith("/api/rtc") ||
    isAuthApi(url) ||
    url.protocol === "blob:" ||
    url.protocol === "data:"
  );
}

function isShellAsset(url) {
  if (url.origin !== self.location.origin) return false;
  const p = url.pathname;
  return (
    p === "/" ||
    p.endsWith(".js") ||
    p.endsWith(".css") ||
    p.endsWith(".woff2") ||
    p.endsWith(".woff") ||
    p.endsWith(".png") ||
    p.endsWith(".ico") ||
    p.endsWith(".webmanifest") ||
    p.endsWith(".svg")
  );
}

function canPutInCache(response) {
  if (!response || !response.ok) return false;
  if (response.status === 206) return false;
  if (response.headers.has("Set-Cookie")) return false;
  const cc = response.headers.get("Cache-Control") || "";
  if (/\bno-store\b/i.test(cc) || /\bprivate\b/i.test(cc)) return false;
  return true;
}

async function networkFirst(request, cacheName, timeoutMs = 3000) {
  const cache = await caches.open(cacheName);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (canPutInCache(response)) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("network-first failed");
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (canPutInCache(response)) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);
  return cached || (await networkPromise) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (isNeverCache(url)) return;

  if (isApi(url)) {
    event.respondWith(
      networkFirst(request, API_CACHE, 3500).catch(
        () =>
          new Response(JSON.stringify({ error: "offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (canPutInCache(res)) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match(request)) ||
            (await cache.match("/")) ||
            (await cache.match("/offline.html")) ||
            new Response("Offline", { status: 503, statusText: "Offline" })
          );
        }),
    );
    return;
  }

  if (isShellAsset(url)) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
  }
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
