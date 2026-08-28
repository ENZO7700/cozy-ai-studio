#!/usr/bin/env node
/**
 * Visual regression suite for Cozy AI Studio Live Preview artifacts.
 *
 * Compares Playwright screenshots against committed baselines using
 * pixelmatch. Stable fixtures (generator previewHtml / starter HTML) —
 * does not require a running dev server.
 *
 * Usage:
 *   npm run test:visual                 # compare vs baselines
 *   UPDATE_BASELINES=1 npm run test:visual   # rewrite goldens
 *   VISUAL_MAX_DIFF_RATIO=0.01 npm run test:visual
 *
 * Exit 0 = green. Writes:
 *   screenshots/visual/<name>-actual.png
 *   screenshots/visual/<name>-diff.png   (on fail)
 *   screenshots/visual-regression-report.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { chromium } from "playwright";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const ROOT = resolve(import.meta.dirname, "..");
const BASELINES = resolve(ROOT, "tests/visual/baselines");
const OUT = resolve(ROOT, "screenshots/visual");
const UPDATE = process.env.UPDATE_BASELINES === "1" || process.argv.includes("--update");
const MAX_DIFF_RATIO = Number(process.env.VISUAL_MAX_DIFF_RATIO || "0.012"); // 1.2%

mkdirSync(BASELINES, { recursive: true });
mkdirSync(OUT, { recursive: true });

const fails = [];
const notes = [];
const results = [];

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

function extractPreviewHtml(chunk) {
  if (!chunk) return null;
  const phStart = chunk.indexOf("previewHtml: `");
  if (phStart < 0) return null;
  const rest = chunk.slice(phStart + "previewHtml: `".length);
  // end at ",\n      }" or "`,\n"
  let i = 0;
  let end = -1;
  while (i < rest.length) {
    if (rest[i] === "`" && rest[i - 1] !== "\\") {
      end = i;
      break;
    }
    i++;
  }
  return end >= 0 ? rest.slice(0, end) : null;
}

/** Starter / landing HTML mirrored from studio-store warm tokens */
function starterLandingHtml() {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,system-ui,sans-serif;background:#F4F1EA;color:#1C1D21;min-height:100vh}
.page{min-height:100vh;background:#F4F1EA;color:#1C1D21}
.top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;border-bottom:1px solid rgba(28,29,33,0.1)}
.logo{font-family:Georgia,serif;font-size:1.35rem;font-weight:700}
.nav{display:flex;flex-wrap:wrap;align-items:center;gap:16px;font-size:0.875rem;color:rgba(28,29,33,0.6)}
.btn{background:#D96B43;color:#fff;border:none;border-radius:10px;padding:8px 14px;font-weight:500;font-size:0.875rem;box-shadow:3px 3px 0 #1C1D21}
.hero{max-width:42rem;margin:0 auto;padding:64px 20px;text-align:center}
.eyebrow{font-size:0.75rem;letter-spacing:0.14em;text-transform:uppercase;color:#D96B43;font-weight:600;margin-bottom:12px}
h1{font-family:Georgia,serif;font-size:clamp(2rem,6vw,3rem);line-height:1.12;margin-bottom:16px}
.hero p{color:rgba(28,29,33,0.6);font-size:1.05rem;line-height:1.6;margin-bottom:28px}
.actions{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
.btn-primary{background:#D96B43;color:#fff;border:none;border-radius:12px;padding:12px 22px;font-weight:500;box-shadow:4px 4px 0 #1C1D21}
.btn-outline{background:transparent;color:#1C1D21;border:2px solid #1C1D21;border-radius:12px;padding:12px 20px;font-weight:500}
</style></head>
<body>
<main class="page">
  <header class="top">
    <div class="logo">Aurora</div>
    <nav class="nav">
      <span>Features</span>
      <span>Pricing</span>
      <button type="button" class="btn">Get started</button>
    </nav>
  </header>
  <section class="hero">
    <p class="eyebrow">Warm Brutalism</p>
    <h1>Design that feels handmade</h1>
    <p>A starter landing page generated inside Cozy AI Studio. Edit with AI agents and watch the preview update live.</p>
    <div class="actions">
      <button type="button" class="btn-primary">Start building</button>
      <button type="button" class="btn-outline">View demo</button>
    </div>
  </section>
</main>
</body></html>`;
}

/** Broken Tailwind-only mash fixture — must NOT match golden dashboard */
function brokenMashHtml() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>body{font-family:system-ui;background:#F4F1EA;margin:0;padding:8px;color:#1C1D21}</style>
</head><body>
<header>Aurora</header>
<nav>DashboardAnalyticsSettingsLogout</nav>
<div>Users 1,245 +12%</div>
<div>Revenue $45,678 +8%</div>
<p>erformance Overview</p>
</body></html>`;
}

/**
 * R3 negative: G1 Tailwind-only mash (utility classNames, NO real CSS).
 * Looks like unstyled HTML with class attributes — must diverge from dashboard golden.
 */
function g1TailwindOnlyMashHtml() {
  return `<!DOCTYPE html><html><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>g1-tailwind-only-mash</title>
</head><body>
<div class="min-h-screen flex gap-4 p-4 md:grid grid-cols-4 rounded-2xl">
  <header class="flex justify-between items-center w-full">
    <div class="text-xl font-bold">Aurora</div>
    <nav class="flex gap-4 text-sm">
      <a class="hover:underline">Dashboard</a><a class="hover:underline">Analytics</a><a class="hover:underline">Settings</a>
    </nav>
  </header>
  <div class="grid grid-cols-4 gap-4 p-4">
    <div class="rounded-2xl bg-white p-4 shadow">Users</div>
    <div class="rounded-2xl bg-white p-4 shadow">Revenue</div>
    <div class="rounded-2xl bg-white p-4 shadow">Sessions</div>
    <div class="rounded-2xl bg-white p-4 shadow">Bounce</div>
  </div>
</div>
</body></html>`;
}

function loadPng(buf) {
  return PNG.sync.read(buf);
}

function pngToBuffer(png) {
  return PNG.sync.write(png);
}

function comparePng(baselineBuf, actualBuf, diffPath) {
  const img1 = loadPng(baselineBuf);
  const img2 = loadPng(actualBuf);
  if (img1.width !== img2.width || img1.height !== img2.height) {
    return {
      ok: false,
      reason: `size mismatch baseline ${img1.width}x${img1.height} vs actual ${img2.width}x${img2.height}`,
      diffRatio: 1,
      diffPixels: -1,
    };
  }
  const { width, height } = img1;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(img1.data, img2.data, diff.data, width, height, {
    threshold: 0.12,
    includeAA: false,
  });
  const total = width * height;
  const diffRatio = diffPixels / total;
  writeFileSync(diffPath, pngToBuffer(diff));
  return { ok: diffRatio <= MAX_DIFF_RATIO, reason: null, diffRatio, diffPixels, total };
}

const fixtures = [];

// Dashboard from generators
const gen = readFileSync(resolve(ROOT, "src/lib/ai/generators.ts"), "utf8");
const dashCase = extractCase(gen, "dashboard", "todo");
const dashHtml = extractPreviewHtml(dashCase);
must(Boolean(dashHtml && dashHtml.includes("<!DOCTYPE")), "dashboard previewHtml extractable");

if (dashHtml) {
  fixtures.push({
    name: "dashboard-375",
    html: dashHtml,
    viewport: { width: 375, height: 667, deviceScaleFactor: 1 },
    fullPage: true,
  });
  fixtures.push({
    name: "dashboard-desktop",
    html: dashHtml,
    viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
    fullPage: true,
  });
}

fixtures.push({
  name: "starter-landing-375",
  html: starterLandingHtml(),
  viewport: { width: 375, height: 667, deviceScaleFactor: 1 },
  fullPage: true,
});

fixtures.push({
  name: "starter-landing-desktop",
  html: starterLandingHtml(),
  viewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
  fullPage: true,
});

// Negative: broken mash must differ from dashboard-375 baseline when both exist
const negative = {
  name: "broken-mash-375",
  html: brokenMashHtml(),
  viewport: { width: 375, height: 667, deviceScaleFactor: 1 },
  fullPage: true,
  // compared only against itself as baseline; separate assert vs dashboard
  skipSelfBaseline: false,
};

fixtures.push(negative);

// R3: g1-tailwind-only-mash — utility classes without CSS (must fail vs dashboard golden)
fixtures.push({
  name: "g1-tailwind-only-mash-375",
  html: g1TailwindOnlyMashHtml(),
  viewport: { width: 375, height: 667, deviceScaleFactor: 1 },
  fullPage: true,
});

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  for (const fx of fixtures) {
    const page = await browser.newPage({
      viewport: {
        width: fx.viewport.width,
        height: fx.viewport.height,
      },
      deviceScaleFactor: fx.viewport.deviceScaleFactor ?? 1,
    });
    // Stabilize fonts / reduce flakiness
    await page.addStyleTag({
      content: `* { animation: none !important; transition: none !important; caret-color: transparent !important; }`,
    });
    await page.setContent(fx.html, { waitUntil: "domcontentloaded" });
    // wait for fonts/layout
    await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      if (document.fonts?.ready) await document.fonts.ready;
    });
    await page.waitForTimeout(150);

    const actualPath = resolve(OUT, `${fx.name}-actual.png`);
    const baselinePath = resolve(BASELINES, `${fx.name}.png`);
    const diffPath = resolve(OUT, `${fx.name}-diff.png`);

    await page.screenshot({
      path: actualPath,
      fullPage: Boolean(fx.fullPage),
      animations: "disabled",
    });
    await page.close();

    const actualBuf = readFileSync(actualPath);

    if (UPDATE || !existsSync(baselinePath)) {
      writeFileSync(baselinePath, actualBuf);
      notes.push(`ok: baseline written ${fx.name}`);
      results.push({ name: fx.name, status: UPDATE ? "updated" : "created", path: baselinePath });
      if (!UPDATE && !existsSync(baselinePath)) {
        // first run created baseline — treat as pass but note
      }
      continue;
    }

    const baselineBuf = readFileSync(baselinePath);
    const cmp = comparePng(baselineBuf, actualBuf, diffPath);
    const pct = (cmp.diffRatio * 100).toFixed(3);
    if (cmp.ok) {
      notes.push(`ok: visual ${fx.name} diff ${pct}% (≤ ${(MAX_DIFF_RATIO * 100).toFixed(2)}%)`);
      results.push({
        name: fx.name,
        status: "pass",
        diffRatio: cmp.diffRatio,
        diffPixels: cmp.diffPixels,
      });
    } else {
      const msg = cmp.reason
        ? `visual ${fx.name}: ${cmp.reason}`
        : `visual ${fx.name}: ${pct}% pixels differ (${cmp.diffPixels}/${cmp.total}) > ${(MAX_DIFF_RATIO * 100).toFixed(2)}% — see ${diffPath}`;
      fails.push(msg);
      results.push({
        name: fx.name,
        status: "fail",
        diffRatio: cmp.diffRatio,
        diffPixels: cmp.diffPixels,
        reason: cmp.reason,
        diff: diffPath,
      });
    }
  }

  // Negative regression: broken mash must be VISIBLY different from dashboard golden
  const dashBase = resolve(BASELINES, "dashboard-375.png");
  const mashActual = resolve(OUT, "broken-mash-375-actual.png");
  if (existsSync(dashBase) && existsSync(mashActual)) {
    const diffPath = resolve(OUT, "broken-vs-dashboard-diff.png");
    const cmp = comparePng(readFileSync(dashBase), readFileSync(mashActual), diffPath);
    must(
      cmp.diffRatio > 0.05,
      `broken mash diverges from dashboard golden (${(cmp.diffRatio * 100).toFixed(1)}% diff)`,
    );
  }

  // R3: g1-tailwind-only-mash must FAIL visual contract vs good dashboard
  const twMashActual = resolve(OUT, "g1-tailwind-only-mash-375-actual.png");
  if (existsSync(dashBase) && existsSync(twMashActual)) {
    const diffPath = resolve(OUT, "g1-tailwind-only-mash-vs-dashboard-diff.png");
    const cmp = comparePng(readFileSync(dashBase), readFileSync(twMashActual), diffPath);
    must(
      cmp.diffRatio > 0.05,
      `g1-tailwind-only-mash fails contract vs dashboard (${(cmp.diffRatio * 100).toFixed(1)}% diff) — must stay unstyled mash`,
    );
    notes.push(
      `ok: g1-tailwind-only-mash negative contract (${(cmp.diffRatio * 100).toFixed(1)}% ≠ dashboard)`,
    );
  } else {
    fails.push("g1-tailwind-only-mash-375 actual screenshot missing");
  }
} finally {
  await browser.close();
}

const report = {
  ok: fails.length === 0,
  updateMode: UPDATE,
  maxDiffRatio: MAX_DIFF_RATIO,
  fails,
  notes,
  results,
  baselinesDir: BASELINES,
  outDir: OUT,
};

writeFileSync(resolve(ROOT, "screenshots/visual-regression-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

if (fails.length) {
  console.error(`\nFAIL visual regression — ${fails.length} check(s)`);
  process.exit(1);
}
console.error(UPDATE ? "\nPASS visual baselines updated" : "\nPASS visual regression");
process.exit(0);
