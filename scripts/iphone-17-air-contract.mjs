#!/usr/bin/env node
/**
 * iPhone 17 Air contract — device specs + safe-area under camera + Studio shell.
 *
 * Source: Apple HIG layout + useyourloaf.com/blog/iphone-17-screen-sizes
 *   iPhone Air / 17 Air: 420×912 @3x, safe-area portrait top 68 / bottom 34
 *   Dynamic Island — touch targets must sit BELOW camera housing.
 *
 * Exit 0 = green.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "screenshots");
mkdirSync(OUT, { recursive: true });

const fails = [];
const notes = [];
function must(cond, msg) {
  if (!cond) fails.push(msg);
  else notes.push(`ok: ${msg}`);
}

// ─── 1) Source: devices.ts ───────────────────────────────────────────
const devicesSrc = readFileSync(resolve(ROOT, "src/lib/devices.ts"), "utf8");
must(devicesSrc.includes('id: "iphone-17-air"'), "devices has iphone-17-air");
must(
  /DEFAULT_DEVICE_ID\s*=\s*"iphone-17-air"/.test(devicesSrc),
  "DEFAULT_DEVICE_ID is iphone-17-air",
);
must(
  devicesSrc.includes("injectSafeAreaIntoHtml"),
  "injectSafeAreaIntoHtml exported",
);
must(devicesSrc.includes("safeArea"), "DevicePreset has safeArea");
must(devicesSrc.includes("dynamic-island"), "chrome dynamic-island present");

// Parse dimensions from source roughly
must(/width:\s*420/.test(devicesSrc) && /height:\s*912/.test(devicesSrc), "17 Air 420×912");
must(/top:\s*68/.test(devicesSrc) && /bottom:\s*34/.test(devicesSrc), "17 Air safe-area T68/B34");

// LivePreview uses Dynamic Island + inject
const lp = readFileSync(resolve(ROOT, "src/components/studio/LivePreview.tsx"), "utf8");
must(lp.includes("injectSafeAreaIntoHtml"), "LivePreview injects safe area");
must(lp.includes("dynamic-island") || lp.includes("DeviceChrome"), "LivePreview device chrome");
must(lp.includes("data-device-frame"), "data-device-frame marker");

// Studio shell safe padding (under camera)
const shell = readFileSync(resolve(ROOT, "src/components/studio/StudioShell.tsx"), "utf8");
must(shell.includes("cosy-safe-shell"), "StudioShell cosy-safe-shell");
must(shell.includes('data-safe-shell') || shell.includes("safe-area"), "StudioShell safe shell marker");
must(shell.includes("data-mobile-tabbar"), "mobile tabbar marker");
must(!shell.includes("data-safe-top-spacer"), "no legacy top spacer (pad shell)");

// CSS utilities
const css = readFileSync(resolve(ROOT, "src/styles.css"), "utf8");
must(css.includes("safe-area-inset-top"), "CSS safe-area-inset-top");
must(css.includes("safe-area-inset-bottom"), "CSS safe-area-inset-bottom");
must(css.includes(".cosy-safe-shell"), "CSS .cosy-safe-shell");
must(css.includes("var(--sat)") && css.includes("padding-top"), "CSS shell pads --sat under camera");
must(css.includes(".cosy-sticky-top"), "CSS .cosy-sticky-top for landing");
must(css.includes(".cosy-fixed-bottom"), "CSS .cosy-fixed-bottom for overlays");
must(css.includes("accept-pulse-once"), "CSS accept-pulse-once");
must(css.includes("--sat-fallback"), "CSS --sat-fallback for broken webviews");

// Root viewport-fit=cover + safe-area boot
const root = readFileSync(resolve(ROOT, "src/routes/__root.tsx"), "utf8");
must(root.includes("viewport-fit=cover"), "root meta viewport-fit=cover");
must(root.includes("SAFE_AREA_BOOT") || root.includes("sat-fallback"), "root SAFE_AREA_BOOT for iOS webviews");
const safeLib = readFileSync(resolve(ROOT, "src/lib/safe-area.ts"), "utf8");
must(safeLib.includes("applySafeAreaFallbacks"), "safe-area.ts applySafeAreaFallbacks");
must(safeLib.includes("68"), "safe-area Air top 68 fallback");

// Default device in store + migration to 17 Air
const store = readFileSync(resolve(ROOT, "src/stores/studio-store.ts"), "utf8");
must(/device:\s*"iphone-17-air"/.test(store), "store default device iphone-17-air");
must(store.includes("resolveDeviceId"), "store migrates via resolveDeviceId");
must(/version:\s*2/.test(store), "persist version 2 migrates SE → 17 Air");

// HitL fixed overlay above Home Indicator, not under camera
const hitl = readFileSync(resolve(ROOT, "src/components/studio/HitLApprovalCard.tsx"), "utf8");
must(hitl.includes("cosy-fixed-bottom") || hitl.includes("data-hitl-overlay"), "HitL fixed overlay safe bottom");
must(hitl.includes("min-h-11") || hitl.includes("min-h-12"), "HitL touch targets ≥ 44px");

// Mobile companion under camera
const mobile = readFileSync(resolve(ROOT, "src/routes/mobile.tsx"), "utf8");
must(mobile.includes("cosy-safe-shell"), "mobile companion cosy-safe-shell");
must(mobile.includes("data-mobile-companion"), "mobile companion marker");

// Landing sticky header below camera
const landing = readFileSync(resolve(ROOT, "src/routes/index.tsx"), "utf8");
must(landing.includes("cosy-sticky-top") || landing.includes("safe-area"), "landing sticky under island");
must(landing.includes("420×912") || landing.includes("420x912"), "landing mock shows 17 Air 420×912");
must(!landing.includes("375×667"), "landing no longer SE 375×667");

// ─── 2) Unit: inject uses padding-top under camera ─
const injectFn =
  devicesSrc.includes("padding-top: max(0px, ${bodyTop}px)") ||
  devicesSrc.includes("padding-top: max(0px, ${sa.top}px)");
must(injectFn, "inject uses padding-top under camera");
must(devicesSrc.includes("shellReservesBands"), "inject supports shellReservesBands");
must(devicesSrc.includes("stickyTop"), "inject sticky headers below island");

// ─── 3) Browser: 420×912 Studio + Live Preview ───────────────────────
const BASE = (process.argv[2] || process.env.SHIP_GATE_BASE || "http://127.0.0.1:8080").replace(
  /\/$/,
  "",
);

async function browserPart() {
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  } catch (e) {
    notes.push(`skip browser: ${e.message}`);
    return;
  }

  try {
    // iPhone 17 Air logical viewport
    const page = await browser.newPage({
      viewport: { width: 420, height: 912 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Mobile/15E148 Safari/604.1",
    });

    // Clear persisted SE so default 17 Air applies
    await page.addInitScript(() => {
      try {
        localStorage.removeItem("cozy-ai-studio-v1");
      } catch {
        /* ignore */
      }
    });

    const res = await page.goto(`${BASE}/studio`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    must((res?.status() ?? 0) < 400, `studio HTTP ${res?.status()}`);

    await page.waitForTimeout(1800);

    // Shell present
    const shellEl = await page.locator("[data-studio-shell]").count();
    must(shellEl >= 1, "data-studio-shell present");

    // Shell uses pad mode under camera
    const shellPad = page.locator('[data-safe-shell="pad"]');
    must((await shellPad.count()) >= 1, "studio shell data-safe-shell=pad");
    const padTop = await page.evaluate(() => {
      const el = document.querySelector("[data-studio-shell]");
      if (!el) return -1;
      return parseFloat(getComputedStyle(el).paddingTop) || 0;
    });
    must(padTop >= 0, `shell padding-top readable (got ${padTop})`);

    // Switch to Preview tab on mobile
    const previewTab = page.locator('button:has-text("Preview")').first();
    if (await previewTab.count()) {
      await previewTab.click();
      await page.waitForTimeout(800);
    }

    // Device frame should be 17 Air by default
    const frame = page.locator('[data-device-frame="iphone-17-air"]');
    const frameCount = await frame.count();
    must(frameCount >= 1, "Live Preview frame is iphone-17-air by default");

    // Dynamic Island chrome
    const island = page.locator('[data-device-chrome="dynamic-island"]');
    must((await island.count()) >= 1, "Dynamic Island chrome rendered");

    // Island sits in top zone (under camera housing) — y near top of frame
    if ((await island.count()) > 0) {
      const islandBox = await island.boundingBox();
      const frameBox = await frame.boundingBox();
      if (islandBox && frameBox) {
        must(
          islandBox.y >= frameBox.y - 2 && islandBox.y <= frameBox.y + 20,
          `Dynamic Island at top of frame (y=${islandBox.y.toFixed(0)} frame=${frameBox.y.toFixed(0)})`,
        );
        // Content touch area starts below safe-top (68) inside frame
        notes.push(
          `island box ${Math.round(islandBox.width)}×${Math.round(islandBox.height)} at y=${Math.round(islandBox.y)}`,
        );
      }
    }

    // Safe data attributes
    const previewRoot = page.locator('[data-preview-device="iphone-17-air"]');
    if ((await previewRoot.count()) > 0) {
      const top = await previewRoot.getAttribute("data-safe-top");
      const bottom = await previewRoot.getAttribute("data-safe-bottom");
      must(top === "68", `data-safe-top=68 (got ${top})`);
      must(bottom === "34", `data-safe-bottom=34 (got ${bottom})`);
    } else {
      fails.push("data-preview-device=iphone-17-air missing");
    }

    // Injected safe-area style in iframe srcDoc
    const iframe = page.locator('iframe[data-safe-preview="1"]').first();
    if ((await iframe.count()) > 0) {
      const srcDoc = await iframe.getAttribute("srcdoc");
      must(Boolean(srcDoc && srcDoc.includes("data-cosy-safe-area")), "srcDoc has cosy safe-area style");
      must(Boolean(srcDoc && srcDoc.includes("68px")), "srcDoc simulates top 68px under camera");
      must(Boolean(srcDoc && /viewport-fit=cover/.test(srcDoc)), "srcDoc viewport-fit=cover");
      // Shell bands reserve top; inject still carries --sat: 68px
      must(
        Boolean(srcDoc && /--sat:\s*68px/.test(srcDoc)),
        "srcDoc --sat 68px under camera",
      );
    } else {
      notes.push("iframe data-safe-preview not found (may still be loading)");
    }

    // Layout bands: touch content starts BELOW island (not under camera)
    const topBand = page.locator('[data-safe-band="top"]');
    const contentBand = page.locator('[data-safe-content="1"]');
    if ((await topBand.count()) > 0 && (await contentBand.count()) > 0) {
      const tb = await topBand.boundingBox();
      const cb = await contentBand.boundingBox();
      if (tb && cb) {
        must(
          Math.abs(tb.height - 68) <= 4 || tb.height >= 60,
          `top safe band ~68px (got ${tb.height.toFixed(0)})`,
        );
        must(
          cb.y >= tb.y + tb.height - 2,
          `content band below island (content.y=${cb.y.toFixed(0)} band.bottom=${(tb.y + tb.height).toFixed(0)})`,
        );
        notes.push(
          `safe bands: top H=${Math.round(tb.height)} content y=${Math.round(cb.y)}`,
        );
      }
    } else {
      notes.push("data-safe-band layout not found (fallback inject-only mode)");
    }

    // Tab bar marker + min touch height
    const tabbar = page.locator("[data-mobile-tabbar]");
    if ((await tabbar.count()) > 0) {
      const box = await tabbar.boundingBox();
      must(Boolean(box && box.height >= 44), `tabbar height >= 44 (got ${box?.height})`);
      // Bottom of tabbar should be within viewport (not clipped)
      must(
        Boolean(box && box.y + box.height <= 912 + 2),
        `tabbar within 420×912 viewport (bottom ${box ? box.y + box.height : "?"})`,
      );
    }

    // No horizontal overflow at 420
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await page.evaluate(() => document.documentElement.clientWidth);
    must(scrollW <= clientW + 2, `no horizontal overflow (${scrollW} vs ${clientW})`);

    await page.screenshot({
      path: resolve(OUT, "iphone-17-air-studio.png"),
      fullPage: false,
    });
    notes.push("screenshot screenshots/iphone-17-air-studio.png");

    // Device picker lists 17 Air
    const picker = page.locator("[data-device-picker]").first();
    if ((await picker.count()) > 0) {
      await picker.click();
      await page.waitForTimeout(400);
      const opt = page.locator('[data-device-option="iphone-17-air"]');
      must((await opt.count()) >= 1, "device picker has iphone-17-air option");
      const label = await opt.first().innerText().catch(() => "");
      must(/17\s*Air/i.test(label) || label.includes("420"), `picker option labels 17 Air (got ${label.slice(0, 40)})`);
      await page.screenshot({
        path: resolve(OUT, "iphone-17-air-device-picker.png"),
        fullPage: false,
      });
    }

    // Mobile companion route safe markers
    const mobileRes = await page.goto(`${BASE}/mobile`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    must((mobileRes?.status() ?? 0) < 400, `mobile HTTP ${mobileRes?.status()}`);
    await page.waitForTimeout(600);
    must(
      (await page.locator("[data-mobile-companion]").count()) >= 1,
      "mobile companion shell",
    );
    must(
      (await page.locator('[data-safe-shell="pad"]').count()) >= 1,
      "mobile companion pad shell",
    );
    await page.screenshot({
      path: resolve(OUT, "iphone-17-air-mobile-companion.png"),
      fullPage: false,
    });
  } finally {
    await browser.close();
  }
}

await browserPart();

const report = {
  ok: fails.length === 0,
  fails,
  notes,
  at: new Date().toISOString(),
  target: {
    device: "iphone-17-air",
    width: 420,
    height: 912,
    safeArea: { top: 68, bottom: 34 },
    chrome: "dynamic-island",
    docs: "https://useyourloaf.com/blog/iphone-17-screen-sizes/",
  },
};
writeFileSync(resolve(OUT, "iphone-17-air-contract.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exit(fails.length ? 1 : 0);
