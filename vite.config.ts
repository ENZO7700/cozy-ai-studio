import type { Plugin } from "vite";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { realtimeWsPlugin } from "./src/lib/realtime/ws-plugin";

/**
 * Finish PGLite bootstrap during dev-server setup (before traffic). Vite awaits
 * async `configureServer` hooks. Production: `src/lib/db` kicks `ensureDbReady`
 * on import.
 */

/**
 * Client builds must never evaluate Node-only packages (vite/rolldown/pg).
 * Those pull `module.createRequire`, which crashes the browser:
 *   TypeError: (0 , I.createRequire) is not a function
 */
function clientNodeStubPlugin(): Plugin {
  const stubIds = new Set([
    "vite",
    "rolldown",
    "pg",
    "pg-native",
    "stripe",
    "kysely",
    "module",
    "node:module",
    "fs",
    "node:fs",
    "path",
    "node:path",
    "crypto",
    "node:crypto",
    "net",
    "node:net",
    "tls",
    "node:tls",
    "child_process",
    "node:child_process",
    "os",
    "node:os",
    "http",
    "https",
    "zlib",
    "worker_threads",
    "perf_hooks",
    "@electric-sql/pglite",
  ]);
  const stubPrefixes = [
    "vite/",
    "rolldown/",
    "better-auth/adapters",
    "better-auth/plugins",
    "kysely/",
    "pg/",
    "@electric-sql/pglite/",
  ];
  return {
    name: "app-builder:client-node-stub",
    enforce: "pre",
    resolveId(id, _importer, options) {
      if (options?.ssr) return null;
      const bare = id.split("?")[0] ?? id;
      if (
        stubIds.has(bare) ||
        stubPrefixes.some((p) => bare === p || bare.startsWith(p))
      ) {
        return `\0client-node-stub:${bare}`;
      }
      return null;
    },
    load(id) {
      if (!id.startsWith("\0client-node-stub:")) return null;
      return [
        "export default {};",
        "export const transformWithOxc = undefined;",
        "export const defineConfig = () => ({});",
        "export function createRequire() { return () => ({}); }",
        "export const Pool = function Pool() {};",
        "export const types = { setTypeParser() {} };",
        "export const PGlite = function PGlite() {};",
      ].join("\n");
    },
  };
}


/** COOP/COEP for WebContainer. Use credentialless (not require-corp) so
 *  Grok preview / third-party assets are not blocked. Skip isolation when the
 *  page is embedded (iframe) — SAB unavailable there anyway (srcDoc fallback). */
function webcontainerHeadersPlugin(): Plugin {
  return {
    name: "app-builder:webcontainer-headers",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const dest = String(req.headers["sec-fetch-dest"] || "");
        const isEmbed = dest === "iframe" || dest === "embed";
        if (!isEmbed) {
          res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        }
        next();
      });
    },
  };
}

function pgliteBootstrapPlugin(): Plugin {
  return {
    name: "app-builder:pglite-bootstrap",
    apply: "serve",
    async configureServer(server) {
      try {
        const mod = (await server.ssrLoadModule("/src/lib/db.ts")) as {
          ensureDbReady?: () => Promise<void>;
        };
        if (typeof mod.ensureDbReady === "function") {
          await mod.ensureDbReady();
        }
      } catch (err) {
        console.error("[app-builder] DB bootstrap failed:", err);
        throw err;
      }
    },
  };
}

function authPopupPlugin(): Plugin {
  return {
    name: "app-builder:auth-popup",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const rawUrl = req.url ?? "";
          const pathOnly = rawUrl.split("?", 1)[0] ?? "";
          if (pathOnly !== "/auth/popup") {
            next();
            return;
          }
          if ((req.method ?? "GET").toUpperCase() !== "GET") {
            res.statusCode = 405;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("Method Not Allowed");
            return;
          }

          const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost:8080");
          const proto = String(
            req.headers["x-forwarded-proto"] ??
              ((req.socket as { encrypted?: boolean } | undefined)?.encrypted ? "https" : "http"),
          );
          const requestHeaders = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value === undefined) continue;
            if (Array.isArray(value)) {
              for (const v of value) requestHeaders.append(key, v);
            } else {
              requestHeaders.set(key, value);
            }
          }
          if (!requestHeaders.has("host")) requestHeaders.set("host", host);

          const request = new Request(`${proto}://${host}${rawUrl}`, {
            method: "GET",
            headers: requestHeaders,
          });

          const mod = (await server.ssrLoadModule("/src/lib/auth/popup.server.ts")) as {
            handleAuthPopupRequest: (req: Request) => Promise<Response>;
          };
          const response = await mod.handleAuthPopupRequest(request);

          res.statusCode = response.status;
          const setCookies =
            typeof response.headers.getSetCookie === "function"
              ? response.headers.getSetCookie()
              : [];
          response.headers.forEach((value, key) => {
            if (key.toLowerCase() === "set-cookie") return;
            res.setHeader(key, value);
          });
          for (const cookie of setCookies) {
            res.appendHeader("set-cookie", cookie);
          }
          const body = Buffer.from(await response.arrayBuffer());
          res.end(body);
        } catch (err) {
          console.error("[app-builder] /auth/popup handler failed:", err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("auth popup failed");
          }
        }
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    allowedHosts: true,
    headers: {
      "Cross-Origin-Embedder-Policy": "credentialless",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    allowedHosts: true,
    headers: {
      "Cross-Origin-Embedder-Policy": "credentialless",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  resolve: { tsconfigPaths: true },
  optimizeDeps: {
    exclude: ["@webcontainer/api", "vite", "rolldown", "pg", "stripe"],
  },
  ssr: {
    external: ["@webcontainer/api", "vite", "rolldown"],
  },
  plugins: [
    clientNodeStubPlugin(),
    webcontainerHeadersPlugin(),
    realtimeWsPlugin(),
    pgliteBootstrapPlugin(),
    authPopupPlugin(),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build"
      ? [
          nitro({
            preset: "vercel",
            routeRules: {
              "/**": {
                headers: {
                  "Cross-Origin-Embedder-Policy": "credentialless",
                  "Cross-Origin-Opener-Policy": "same-origin",
                },
              },
            },
          }),
        ]
      : []),
    viteReact(),
  ],
}));
