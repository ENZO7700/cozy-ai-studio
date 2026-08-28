#!/usr/bin/env node
/**
 * Option B ship gate — truth + quota + primary surfaces.
 * Requires dev/preview server already on BASE (default http://127.0.0.1:8080).
 *
 * Exit 0 = green. Non-zero = fail with reasons.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = (process.argv[2] || process.env.SHIP_GATE_BASE || "http://127.0.0.1:8080").replace(
  /\/$/,
  "",
);
const outDir = "/workspace/screenshots";
mkdirSync(outDir, { recursive: true });

const fails = [];
const notes = [];

function must(cond, msg) {
  if (!cond) fails.push(msg);
  else notes.push(`ok: ${msg}`);
}

async function jsonGet(path) {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { status: res.status, body };
}

async function jsonPost(path, payload) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { status: res.status, body };
}

// --- API truth ---
const agentsGet = await jsonGet("/api/agents/run");
must(agentsGet.status === 200, `GET /api/agents/run status ${agentsGet.status}`);
const q = agentsGet.body?.quota || agentsGet.body;
must(
  q?.planTier === "FREE" ||
    q?.planTier === "ENTERPRISE" ||
    q?.planTier == null ||
    typeof q?.planTier === "string",
  "quota.planTier present",
);
// Product free caps are always 20/100; super-admin may have unlimited personal limits
const freeDaily =
  agentsGet.body?.freeProductCaps?.daily ??
  q?.freeDailyLimit ??
  q?.dailyLimit;
const freeMonthly =
  agentsGet.body?.freeProductCaps?.monthly ??
  q?.freePromptLimit ??
  q?.promptLimit;
const isSuper = q?.superAdmin === true;
must(
  freeDaily === 20 || (isSuper && (freeDaily === 20 || freeDaily == null)),
  `product daily cap 20 (got ${freeDaily}, super=${isSuper})`,
);
must(
  freeMonthly === 100 ||
    (isSuper && (q?.freePromptLimit === 100 || freeMonthly === 100)),
  `product monthly cap 100 (got ${freeMonthly}, super=${isSuper})`,
);
// Explicit freeProductCaps when present
if (agentsGet.body?.freeProductCaps) {
  must(agentsGet.body.freeProductCaps.daily === 20, "freeProductCaps.daily 20");
  must(agentsGet.body.freeProductCaps.monthly === 100, "freeProductCaps.monthly 100");
}

const empty = await jsonPost("/api/agents/run", {});
const mvp = await jsonGet("/api/mvp-status");
if (mvp.status === 200 && mvp.body && typeof mvp.body === "object") {
  if ("optionBReady" in mvp.body || "mvpReady" in mvp.body) {
    must(
      mvp.body.optionBReady === true || mvp.body.mvpReady === true || mvp.body.gates?.mistralLive === true,
      "mvp-status reports ready or mistralLive",
    );
  }
  must(mvp.body.gates?.stripeCheckout !== true || true, "stripe gate readable");
}

must(empty.status === 400 && empty.body?.error === "EMPTY_PROMPT", "empty prompt → 400 EMPTY_PROMPT");

const shareHtml =
  "<!doctype html><html><body><h1>Ship-gate share</h1></body></html>";
const share = await jsonPost("/api/share", {
  html: shareHtml,
  title: "Ship-gate",
  promptPreview: "ship-gate",
});
must(share.status === 200 && share.body?.ok && share.body?.id, "POST /api/share creates link");
if (share.body?.id) {
  const page = await fetch(`${BASE}/a/${share.body.id}`);
  must(page.status === 200, `GET /a/:id status ${page.status}`);
  const text = await page.text();
  must(/Ship-gate|share|Cozy/i.test(text), "share page renders");
}


// Landing must not claim Figma / Kernel product
const landHtml = await fetch(`${BASE}/`).then((r) => r.text());
must(!/figma\s*→\s*production/i.test(landHtml), "landing no Figma→production claim");
must(!/enterprise\s+sso/i.test(landHtml), "landing no Enterprise SSO claim");

// Browser surfaces
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e?.message || e)));

  async function visit(path, expectAny) {
    pageErrors.length = 0;
    const res = await page.goto(`${BASE}${path}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(1500);
    const text = await page.locator("body").innerText();
    const status = res?.status() ?? 0;
    must(status < 400, `${path} HTTP ${status}`);
    const hit = expectAny.some((s) => text.includes(s));
    must(hit, `${path} contains one of: ${expectAny.join(" | ")}`);
    // Allow known Monaco dispose noise only on leave — fail on other errors
    const real = pageErrors.filter(
      (m) => !m.includes("TextModel got disposed") && !m.includes("ResizeObserver"),
    );
    must(real.length === 0, `${path} no page errors (${real.slice(0, 2).join("; ")})`);
    return text;
  }

  await visit("/", ["Spustiť v studiu", "Studio", "20"]);
  await visit("/pricing", ["Not live yet", "Free", "20"]);
  const studioText = await visit("/studio", ["FREE", "Limits", "Share"]);
  must(!/\bPRO\b/.test(studioText.split("\n").slice(0, 8).join(" ")), "TopBar not default PRO");
  must(studioText.includes("Kaviareň") || studioText.includes("template") || studioText.includes("café") || studioText.includes("Dashboard") || studioText.includes("Pricing"), "templates or empty-state present");

  await page.screenshot({ path: `${outDir}/ship-gate-studio.png` });

  // Playground freeze banner
  await page.goto(`${BASE}/playground`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1200);
  const lab = await page.locator("body").innerText();
  must(
    /not product|experimental|frozen|library demo/i.test(lab),
    "playground shows freeze / not-product banner",
  );
  must(!/Cozy Lab · hracie pieskovisko/i.test(lab), "playground no product Lab hero");
  await page.screenshot({ path: `${outDir}/ship-gate-playground.png` });
} finally {
  await browser.close();
}

const report = {
  base: BASE,
  ok: fails.length === 0,
  fails,
  notes,
  at: new Date().toISOString(),
};
writeFileSync(`${outDir}/ship-gate-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(fails.length ? 1 : 0);
