#!/usr/bin/env node
/**
 * Sell-ready setup: Supabase (API) → Vercel env → migrate → optional redeploy.
 *
 * Required env (do NOT commit):
 *   SUPABASE_ACCESS_TOKEN  — Dashboard → Account → Access Tokens (sbp_…)
 *   VERCEL_TOKEN           — vercel.com/account/tokens (vcp_…)
 * Optional:
 *   SUPABASE_PROJECT_REF   — default uotvcsjoriamsagfprbq
 *   VERCEL_PROJECT          — default cozy-ai-studio
 *   STRIPE_*               — not available via Supabase; set manually
 *   SKIP_DEPLOY=1
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=sbp_… VERCEL_TOKEN=vcp_… node scripts/setup-sell-ready.mjs
 */

import { spawnSync } from "node:child_process";

const REF = process.env.SUPABASE_PROJECT_REF || "uotvcsjoriamsagfprbq";
const VERCEL_PROJECT = process.env.VERCEL_PROJECT || "cozy-ai-studio";
const SUPA = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const VERCEL = process.env.VERCEL_TOKEN?.trim();
const SITE = process.env.SITE_URL || "https://cozy-ai-studio.vercel.app";

function die(msg) {
  console.error("[sell-ready]", msg);
  process.exit(1);
}

if (!SUPA) die("Set SUPABASE_ACCESS_TOKEN (new sbp_… from Supabase Account → Access Tokens)");
if (!VERCEL) die("Set VERCEL_TOKEN");

async function supa(path, opts = {}) {
  const res = await fetch(`https://api.supabase.com/v1${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${SUPA}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    die(`Supabase API ${path} → ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }
  return body;
}

function vercelEnv(key, value) {
  const r = spawnSync(
    "vercel",
    ["env", "add", key, "production", "--token", VERCEL, "--force", "--scope", "u0352652320-8831s-projects"],
    {
      input: value,
      encoding: "utf8",
      cwd: process.cwd(),
    },
  );
  if (r.status !== 0) {
    console.warn(`[sell-ready] vercel env ${key}:`, r.stderr || r.stdout);
  } else {
    console.log(`[sell-ready] Vercel env set: ${key}`);
  }
}

function mask(s) {
  if (!s || s.length < 8) return "(empty)";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

async function main() {
  console.log("[sell-ready] project ref", REF);
  console.log("[sell-ready] site", SITE);

  const projects = await supa("/projects");
  const project = (Array.isArray(projects) ? projects : []).find((p) => p.id === REF);
  if (!project) {
    console.log(
      "[sell-ready] projects:",
      (Array.isArray(projects) ? projects : []).map((p) => p.id),
    );
    die(`Project ${REF} not found for this access token`);
  }
  console.log("[sell-ready] found project", project.name, project.region);

  // API keys
  const keys = await supa(`/projects/${REF}/api-keys`);
  const list = Array.isArray(keys) ? keys : keys?.api_keys || [];
  const anon =
    list.find((k) => k.name === "anon" || k.tags?.includes("anon"))?.api_key ||
    list.find((k) => k.type === "legacy" && k.name === "anon")?.api_key;
  const service =
    list.find((k) => k.name === "service_role" || k.tags?.includes("service_role"))
      ?.api_key ||
    list.find((k) => k.name === "service_role")?.api_key;

  // New key format fallback
  const publishable = list.find((k) => String(k.name).includes("publishable"))?.api_key;
  const secret = list.find((k) => String(k.name).includes("secret"))?.api_key;

  const anonKey = anon || publishable;
  const serviceKey = service || secret;
  if (!anonKey) die("Could not read anon/publishable key");
  if (!serviceKey) die("Could not read service_role/secret key");

  console.log("[sell-ready] anon", mask(anonKey));
  console.log("[sell-ready] service_role", mask(serviceKey));

  // Database connection string (pooler preferred)
  let databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    try {
      // Some accounts expose connection string via API
      const conf = await supa(`/projects/${REF}/config/database`);
      // password is not returned — need separate call or user-supplied
      console.log("[sell-ready] db config keys", Object.keys(conf || {}));
    } catch (e) {
      console.warn("[sell-ready] database config:", e.message);
    }
    // Try secrets endpoint (may 404)
    try {
      const secrets = await supa(`/projects/${REF}/secrets`);
      console.log(
        "[sell-ready] secrets count",
        Array.isArray(secrets) ? secrets.length : typeof secrets,
      );
    } catch {
      /* ignore */
    }
  }

  if (!databaseUrl) {
    const dbPass = process.env.SUPABASE_DB_PASSWORD?.trim();
    if (dbPass) {
      // Transaction pooler URI (IPv4 friendly)
      databaseUrl = `postgresql://postgres.${REF}:${encodeURIComponent(dbPass)}@aws-0-${project.region || "eu-central-1"}.pooler.supabase.com:6543/postgres`;
      console.log("[sell-ready] built DATABASE_URL from SUPABASE_DB_PASSWORD + region");
    } else {
      console.warn(
        "[sell-ready] DATABASE_URL missing — set DATABASE_URL or SUPABASE_DB_PASSWORD env and re-run",
      );
    }
  }

  const supabaseUrl = `https://${REF}.supabase.co`;

  // Auth redirect URLs (Management API)
  try {
    const authConfig = await supa(`/projects/${REF}/config/auth`);
    const redirects = new Set(
      String(authConfig.uri_allow_list || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    redirects.add(`${SITE}/auth/callback`);
    redirects.add("http://127.0.0.1:8080/auth/callback");
    redirects.add("http://localhost:8080/auth/callback");

    await supa(`/projects/${REF}/config/auth`, {
      method: "PATCH",
      body: JSON.stringify({
        site_url: SITE,
        uri_allow_list: [...redirects].join(","),
      }),
    });
    console.log("[sell-ready] Auth site_url + redirect allow list updated");
  } catch (e) {
    console.warn("[sell-ready] Auth config update failed:", e.message);
    console.warn(
      "[sell-ready] Manual: Authentication → URL Configuration →",
      `${SITE}/auth/callback`,
    );
  }

  // Push to Vercel Production
  const envMap = {
    AUTH_PROVIDER: "supabase",
    VITE_AUTH_PROVIDER: "supabase",
    SUPABASE_URL: supabaseUrl,
    VITE_SUPABASE_URL: supabaseUrl,
    SUPABASE_ANON_KEY: anonKey,
    VITE_SUPABASE_ANON_KEY: anonKey,
    VITE_SUPABASE_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    DEMO_PIPELINE: "false",
  };
  if (databaseUrl) envMap.DATABASE_URL = databaseUrl;

  for (const [k, v] of Object.entries(envMap)) {
    vercelEnv(k, v);
  }

  // Local .env (gitignored)
  const lines = Object.entries(envMap)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(".env.sell-ready", lines + "\n", "utf8"),
  );
  console.log("[sell-ready] wrote .env.sell-ready (gitignored pattern .env*)");

  // Migrate if DATABASE_URL
  if (databaseUrl) {
    const mig = spawnSync("node", ["scripts/migrate.mjs"], {
      env: { ...process.env, DATABASE_URL: databaseUrl },
      encoding: "utf8",
      cwd: process.cwd(),
    });
    console.log(mig.stdout || "");
    if (mig.status !== 0) console.error(mig.stderr);
    else console.log("[sell-ready] migrations applied");
  }

  if (process.env.SKIP_DEPLOY === "1") {
    console.log("[sell-ready] SKIP_DEPLOY=1 — done without deploy");
    return;
  }

  console.log("[sell-ready] deploying…");
  const dep = spawnSync(
    "vercel",
    ["deploy", "--prod", "--yes", "--token", VERCEL],
    { encoding: "utf8", cwd: process.cwd(), stdio: "inherit" },
  );
  if (dep.status !== 0) die("vercel deploy failed");

  console.log("\n[sell-ready] Stripe is NOT set by this script.");
  console.log("  Add manually: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PRO");
  console.log("  Webhook URL:", `${SITE}/api/stripe/webhook`);
  console.log("\n[sell-ready] Verify:");
  console.log(`  curl -s ${SITE}/api/mvp-status`);
}

main().catch((e) => die(e?.message || String(e)));
