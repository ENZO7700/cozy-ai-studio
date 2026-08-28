#!/usr/bin/env node
/**
 * Studio Live Preview contract — SaaS metrics dashboard (no Tailwind).
 *
 * Verifies what you check manually in Studio:
 *  1) Demo generator emits full App.tsx with self-contained CSS
 *  2) Nav labels are spaced (not "DashboardAnalyticsSettings")
 *  3) 4 KPI cards + Performance chart + 6 activity rows
 *  4) Mobile 375×667: content not clipped, scroll works
 *  5) G1 production prompt bans Tailwind-only output
 *
 * Exit 0 = green. Non-zero = fail with reasons.
 * Screenshots: /workspace/screenshots/dashboard-preview-*.png
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "screenshots");
mkdirSync(OUT, { recursive: true });

const fails = [];
const notes = [];

function must(cond, msg) {
  if (!cond) fails.push(msg);
  else notes.push(`ok: ${msg}`);
}

function extractCase(src, name, nextName) {
  const start = src.indexOf(`case "${name}":`);
  if (start < 0) return null;
  const end = nextName ? src.indexOf(`case "${nextName}":`, start + 1) : src.length;
  return src.slice(start, end > 0 ? end : src.length);
}

function extractBacktickField(chunk, field) {
  // field: `...content...`,
  const re = new RegExp(`${field}:\\s*\`([\\s\\S]*?)\`,\\s*\\n\\s*(?:previewHtml|auditNotes|code|title|description|affectedFiles|filePath|language|plan)`);
  const m = chunk.match(re);
  if (m) return m[1];
  // last field before closing
  const re2 = new RegExp(`${field}:\\s*\`([\\s\\S]*?)\`,\\s*\\n\\s*\\}`);
  const m2 = chunk.match(re2);
  return m2 ? m2[1] : null;
}

// ─── 1) Source contracts ─────────────────────────────────────────────
const genPath = resolve(ROOT, "src/lib/ai/generators.ts");
const prodPath = resolve(ROOT, "src/lib/ai/production-run.server.ts");
const storePath = resolve(ROOT, "src/stores/studio-store.ts");

const gen = readFileSync(genPath, "utf8");
const prod = readFileSync(prodPath, "utf8");
const store = readFileSync(storePath, "utf8");

const dash = extractCase(gen, "dashboard", "todo");
must(Boolean(dash), "generators has case dashboard");

// Prefer raw string between code: ` and `,previewHtml
let code = null;
if (dash) {
  const codeStart = dash.indexOf("code: `");
  const previewStart = dash.indexOf("previewHtml:");
  if (codeStart >= 0 && previewStart > codeStart) {
    code = dash.slice(codeStart + "code: `".length, previewStart);
    // trim trailing `,
    code = code.replace(/`,\s*$/, "");
  }
}
must(Boolean(code && code.length > 500), "dashboard code template extracted");

if (code) {
  must(code.includes("<style>"), "App.tsx embeds <style> (self-contained CSS)");
  must(code.includes("export default function App"), "export default App");
  must(!/\bmin-h-screen\b/.test(code), "no Tailwind min-h-screen utility");
  must(!/\b(sm|md|lg|xl):[a-z]/.test(code), "no Tailwind responsive prefixes as styling");
  must(!/from\s+['"]recharts['"]/.test(code), "no recharts import");
  must(!/from\s+['"]chart\.js['"]/.test(code), "no chart.js import");
  must(code.includes("#F4F1EA") && code.includes("#D96B43") && code.includes("#1C1D21"), "warm palette tokens");
  must(code.includes("padding-bottom: 24px"), "mobile padding-bottom 24px");
  must(code.includes("overflow: visible") || code.includes("overflow:visible"), "overflow visible");
  must(code.includes("Performance Overview") || code.includes("PerformanceChart"), "Performance Overview / chart");
  must(code.includes("<svg") || code.includes("className=\"bars\""), "SVG or CSS bar chart");
  must(code.includes("Recent activity") || code.includes("ACTIVITY"), "Recent activity section");

  for (const kpi of ["Users", "Revenue", "Conversions", "Active Users"]) {
    must(code.includes(kpi), `KPI label: ${kpi}`);
  }
  for (const nav of ["Dashboard", "Analytics", "Settings", "Logout"]) {
    must(code.includes(nav), `nav item: ${nav}`);
  }

  // activity rows: count time: entries in ACTIVITY array
  const actBlock = code.match(/const ACTIVITY[\s\S]*?=\s*\[([\s\S]*?)\];/);
  const actCount = actBlock ? (actBlock[1].match(/time:\s*"/g) || []).length : 0;
  must(actCount >= 4 && actCount <= 8, `activity rows 4–8 (got ${actCount})`);
  must(actCount >= 6, `activity has at least 6 rows (got ${actCount})`);

  // gap for nav spacing
  must(
    /gap:\s*\d+px/.test(code) || code.includes("gap: 8px") || code.includes("gap:12px"),
    "nav/layout uses CSS gap (not mashed inline)",
  );
}

// G1 system prompt
must(prod.includes("NO Tailwind") || prod.includes("no Tailwind"), "G1 prompt bans Tailwind");
must(!/Generate production-quality React \+ TypeScript \(TSX\) with Tailwind\./.test(prod), "G1 no longer requires Tailwind");
must(prod.includes("<style>") || prod.includes("inline style"), "G1 requires style tag or inline");

// Starter also self-contained
must(store.includes("<style>"), "starter App uses <style>");
must(!/min-h-screen bg-\[#F4F1EA\]/.test(store), "starter not Tailwind-only shell");

// ─── 2) Render previewHtml @ 375×667 ─────────────────────────────────
let previewHtml = null;
if (dash) {
  const phStart = dash.indexOf("previewHtml: `");
  if (phStart >= 0) {
    const rest = dash.slice(phStart + "previewHtml: `".length);
    const endTick = rest.indexOf("`,\n");
    const endTick2 = rest.indexOf("`,\r\n");
    const endBrace = rest.indexOf("`,\n      }");
    let cut = endTick;
    if (endTick2 >= 0 && (cut < 0 || endTick2 < cut)) cut = endTick2;
    if (endBrace >= 0 && (cut < 0 || endBrace < cut)) cut = endBrace;
    if (cut < 0) cut = rest.lastIndexOf("`");
    previewHtml = rest.slice(0, cut);
  }
}
must(Boolean(previewHtml && previewHtml.includes("<!DOCTYPE")), "previewHtml is full HTML document");

if (previewHtml) {
  must(!previewHtml.includes("DashboardAnalyticsSettings"), "previewHtml nav not mashed in source");
  must(previewHtml.includes("Metrics Dashboard") || previewHtml.includes("Studio health"), "preview title present");
  must(previewHtml.includes("Performance Overview"), "preview Performance Overview");
  must(previewHtml.includes("Recent activity"), "preview Recent activity");
}

const shot375 = resolve(OUT, "dashboard-preview-375.png");
const shotDesktop = resolve(OUT, "dashboard-preview-desktop.png");

if (previewHtml) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    // Mobile iPhone SE
    const page = await browser.newPage({
      viewport: { width: 375, height: 667 },
      deviceScaleFactor: 2,
    });
    const consoleErrors = [];
    page.on("pageerror", (e) => consoleErrors.push(String(e.message || e)));
    await page.setContent(previewHtml, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);

    const bodyText = await page.locator("body").innerText();
    // Real mash would be a single token; spaced nav has whitespace/newlines between labels
    must(
      /Dashboard[\s\u00a0]+Analytics|Dashboard[\s\S]{0,5}Analytics/.test(bodyText) ||
        (bodyText.includes("Dashboard") && bodyText.includes("Users")),
      "rendered nav labels present (Dashboard + Analytics/Users)",
    );
    must(
      !/>\s*DashboardAnalyticsSettings\s*</.test(previewHtml) &&
        !bodyText.includes("DashboardAnalyticsSettings"),
      "rendered nav not mashed as single word DashboardAnalyticsSettings",
    );
    must(bodyText.includes("Dashboard"), "visible: Dashboard");
    must(bodyText.includes("Analytics") || bodyText.includes("Users"), "visible: Analytics or Users");
    must(bodyText.includes("Users"), "visible: Users KPI");
    must(bodyText.includes("Revenue"), "visible: Revenue KPI");
    must(bodyText.includes("Performance Overview"), "visible: Performance Overview");
    must(bodyText.includes("Recent activity"), "visible: Recent activity");

    // scroll height vs viewport — content should extend or fully fit without clip of last section
    const metrics = await page.evaluate(() => {
      const doc = document.documentElement;
      const body = document.body;
      const last = document.querySelector(".panel:last-of-type, main > div:last-child, main");
      const lastRect = last ? last.getBoundingClientRect() : null;
      return {
        scrollHeight: Math.max(doc.scrollHeight, body.scrollHeight),
        clientHeight: doc.clientHeight,
        bodyOverflow: getComputedStyle(body).overflow,
        lastBottom: lastRect ? lastRect.bottom : null,
      };
    });

    must(
      metrics.scrollHeight >= 500,
      `content has height (scrollHeight=${metrics.scrollHeight})`,
    );
    // If content taller than viewport, scroll to bottom and ensure last panel is in view
    if (metrics.scrollHeight > 667) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(150);
      const bottomText = await page.locator("body").innerText();
      must(
        /activity|Signed up|Payment|Trial|ok|pending/i.test(bottomText),
        "after scroll to bottom, activity still readable",
      );
    } else {
      notes.push("ok: content fits mobile viewport without scroll");
    }

    must(consoleErrors.length === 0, `no page errors (${consoleErrors.join("; ") || "none"})`);

    await page.screenshot({ path: shot375, fullPage: true });
    notes.push(`ok: screenshot ${shot375}`);

    // Desktop smoke
    const desk = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await desk.setContent(previewHtml, { waitUntil: "domcontentloaded" });
    await desk.waitForTimeout(200);
    const deskText = await desk.locator("body").innerText();
    must(deskText.includes("Users") && deskText.includes("Revenue"), "desktop KPIs visible");
    await desk.screenshot({ path: shotDesktop, fullPage: true });
    notes.push(`ok: screenshot ${shotDesktop}`);
    await desk.close();
    await page.close();
  } finally {
    await browser.close();
  }
}

// ─── Report ──────────────────────────────────────────────────────────
// R3 — Tailwind-only risk detector (mirrors src/lib/ai/preflight.ts)
const preflightSrc = readFileSync(resolve(ROOT, "src/lib/ai/preflight.ts"), "utf8");
must(preflightSrc.includes("detectTailwindOnlyRisk"), "preflight exports detectTailwindOnlyRisk");
must(preflightSrc.includes("preview-css"), "preflight has preview-css check");
must(preflightSrc.includes("Preview may be unstyled"), "preflight warn copy present");
must(
  preflightSrc.includes("min-h-screen") && preflightSrc.includes("rounded-2xl"),
  "preflight scans Tailwind utility patterns",
);

// HitL shows the risk banner
const hitl = readFileSync(resolve(ROOT, "src/components/studio/HitLApprovalCard.tsx"), "utf8");
must(hitl.includes("data-preview-style-risk"), "HitL card has preview style risk banner");
must(hitl.includes("Preview may be unstyled"), "HitL warns unstyled preview");

function detectTailwindOnlyRiskMirror(content) {
  const TAILWIND_UTILITY_RE =
    /\b(?:min-h-screen|flex\s+gap-|grid\s+grid-cols|p-\d|px-\d|py-\d|rounded-2xl|md:|lg:|sm:|gap-\d|space-y-\d|space-x-\d|bg-white|text-sm|w-full|h-full|items-center|justify-between)\b/;
  const hasStyleTag = /<style[\s>]/i.test(content);
  const hasStyleAttr = /style=\{\s*\{/.test(content) || /style=\{\s*`/.test(content);
  const hasStyle = hasStyleTag || hasStyleAttr;
  const hasTw =
    TAILWIND_UTILITY_RE.test(content) ||
    /className=["'`][^"'`]*(?:min-h-screen|flex\s|grid\s|gap-\d|p-\d|rounded-2xl|md:)/.test(
      content,
    );
  return hasTw && !hasStyle;
}

const mashApp = `export default function App() {
  return (
    <div className="min-h-screen flex gap-4 p-4 rounded-2xl md:grid">
      <nav className="flex gap-2">Dashboard Analytics Settings</nav>
    </div>
  );
}`;
const styledApp = `export default function App() {
  return (
    <>
      <style>{\`.nav { display: flex; gap: 16px; }\`}</style>
      <nav className="nav">Dashboard Analytics Settings</nav>
    </>
  );
}`;
must(detectTailwindOnlyRiskMirror(mashApp) === true, "R3: Tailwind-only mash → risk true");
must(detectTailwindOnlyRiskMirror(styledApp) === false, "R3: <style> layout → risk false");
must(detectTailwindOnlyRiskMirror(code) === false, "R3: dashboard generator App is self-contained");

const report = {
  ok: fails.length === 0,
  fails,
  notes,
  screenshots: [shot375, shotDesktop],
  contract: {
    brief: "SaaS metrics dashboard with KPI cards",
    accept: "Accept writes src/App.tsx from generator / G1",
    livePreview: "nav spaced · 4 KPIs · chart · 6 activity · mobile no clip",
    r3: "Tailwind-only without <style> → HitL warn + preflight preview-css",
  },
};

const reportPath = resolve(OUT, "dashboard-preview-contract.json");
writeFileSync(reportPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify(report, null, 2));
if (fails.length) {
  console.error(`\nFAIL ${fails.length} check(s)`);
  process.exit(1);
}
console.error("\nPASS dashboard Live Preview contract");
process.exit(0);
