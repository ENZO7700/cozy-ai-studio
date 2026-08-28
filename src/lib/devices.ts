/**
 * Device frames for Live Preview — CSS viewport sizes (logical px / points).
 * Safe-area insets from Apple HIG + useyourloaf.com iPhone 17 screen sizes
 * (portrait: top under Dynamic Island / camera, bottom above Home Indicator).
 * Touch targets must sit INSIDE the safe rectangle — never under the camera.
 */

export type DeviceFamily = "iphone" | "android" | "tablet" | "desktop";

export type SafeAreaInsets = {
  top: number;
  bottom: number;
  left: number;
  right: number;
};

export type DeviceChrome = "none" | "home-button" | "notch" | "dynamic-island";

export type DevicePreset = {
  id: string;
  family: DeviceFamily;
  label: string;
  /** Short chip label */
  short: string;
  width: number;
  height: number;
  /** Phone chrome radius (logical px) */
  radius?: number;
  /** Portrait safe-area insets (logical px) — content/touch below camera */
  safeArea?: SafeAreaInsets;
  /** Status bar height (points) */
  statusBar?: number;
  /** Device frame chrome for Live Preview */
  chrome?: DeviceChrome;
  /** Scale factor (2x / 3x) */
  scale?: number;
};

/** Legacy ids mapped to new presets (persist migration). */
export const LEGACY_DEVICE_MAP: Record<string, string> = {
  mobile: "iphone-17-air",
  tablet: "ipad-air",
  desktop: "desktop-fhd",
  "iphone-se": "iphone-se",
};

const DI: SafeAreaInsets = { top: 59, bottom: 34, left: 0, right: 0 };
const DI_17: SafeAreaInsets = { top: 62, bottom: 34, left: 0, right: 0 };
/** iPhone 17 Air / iPhone Air — taller island inset (useyourloaf). */
const DI_AIR: SafeAreaInsets = { top: 68, bottom: 34, left: 0, right: 0 };
const NOTCH: SafeAreaInsets = { top: 47, bottom: 34, left: 0, right: 0 };
const SE: SafeAreaInsets = { top: 20, bottom: 0, left: 0, right: 0 };
const ANDROID: SafeAreaInsets = { top: 24, bottom: 16, left: 0, right: 0 };
const TABLET: SafeAreaInsets = { top: 24, bottom: 20, left: 0, right: 0 };

export const DEVICE_PRESETS: DevicePreset[] = [
  // ── iPhone (17 Air first as primary target) ─────────────────
  {
    id: "iphone-17-air",
    family: "iphone",
    label: "iPhone 17 Air",
    short: "17 Air",
    width: 420,
    height: 912,
    radius: 55,
    safeArea: DI_AIR,
    statusBar: 54,
    chrome: "dynamic-island",
    scale: 3,
  },
  {
    id: "iphone-17-pro",
    family: "iphone",
    label: "iPhone 17 Pro",
    short: "17 Pro",
    width: 402,
    height: 874,
    radius: 55,
    safeArea: DI_17,
    statusBar: 54,
    chrome: "dynamic-island",
    scale: 3,
  },
  {
    id: "iphone-17-pro-max",
    family: "iphone",
    label: "iPhone 17 Pro Max",
    short: "17 PM",
    width: 440,
    height: 956,
    radius: 55,
    safeArea: DI_17,
    statusBar: 54,
    chrome: "dynamic-island",
    scale: 3,
  },
  {
    id: "iphone-se",
    family: "iphone",
    label: "iPhone SE (3rd)",
    short: "SE",
    width: 375,
    height: 667,
    radius: 36,
    safeArea: SE,
    statusBar: 20,
    chrome: "home-button",
    scale: 2,
  },
  {
    id: "iphone-13",
    family: "iphone",
    label: "iPhone 13 / 14",
    short: "13/14",
    width: 390,
    height: 844,
    radius: 44,
    safeArea: NOTCH,
    statusBar: 47,
    chrome: "notch",
    scale: 3,
  },
  {
    id: "iphone-14-pro",
    family: "iphone",
    label: "iPhone 14 Pro",
    short: "14 Pro",
    width: 393,
    height: 852,
    radius: 48,
    safeArea: DI,
    statusBar: 54,
    chrome: "dynamic-island",
    scale: 3,
  },
  {
    id: "iphone-15",
    family: "iphone",
    label: "iPhone 15",
    short: "15",
    width: 393,
    height: 852,
    radius: 48,
    safeArea: DI,
    statusBar: 54,
    chrome: "dynamic-island",
    scale: 3,
  },
  {
    id: "iphone-15-pro-max",
    family: "iphone",
    label: "iPhone 15 Pro Max",
    short: "15 PM",
    width: 430,
    height: 932,
    radius: 52,
    safeArea: DI,
    statusBar: 54,
    chrome: "dynamic-island",
    scale: 3,
  },
  {
    id: "iphone-16",
    family: "iphone",
    label: "iPhone 16",
    short: "16",
    width: 393,
    height: 852,
    radius: 48,
    safeArea: DI,
    statusBar: 54,
    chrome: "dynamic-island",
    scale: 3,
  },
  {
    id: "iphone-16-pro",
    family: "iphone",
    label: "iPhone 16 Pro",
    short: "16 Pro",
    width: 402,
    height: 874,
    radius: 50,
    safeArea: DI_17,
    statusBar: 54,
    chrome: "dynamic-island",
    scale: 3,
  },
  {
    id: "iphone-16-pro-max",
    family: "iphone",
    label: "iPhone 16 Pro Max",
    short: "16 PM",
    width: 440,
    height: 956,
    radius: 54,
    safeArea: DI_17,
    statusBar: 54,
    chrome: "dynamic-island",
    scale: 3,
  },

  // ── Android ──────────────────────────────────────────────────
  {
    id: "galaxy-s24",
    family: "android",
    label: "Galaxy S24",
    short: "S24",
    width: 360,
    height: 780,
    radius: 36,
    safeArea: ANDROID,
    chrome: "notch",
    scale: 3,
  },
  {
    id: "galaxy-s24-ultra",
    family: "android",
    label: "Galaxy S24 Ultra",
    short: "S24U",
    width: 384,
    height: 824,
    radius: 28,
    safeArea: ANDROID,
    chrome: "notch",
    scale: 3,
  },
  {
    id: "galaxy-s25",
    family: "android",
    label: "Galaxy S25",
    short: "S25",
    width: 360,
    height: 780,
    radius: 36,
    safeArea: ANDROID,
    chrome: "notch",
    scale: 3,
  },
  {
    id: "galaxy-s25-ultra",
    family: "android",
    label: "Galaxy S25 Ultra",
    short: "S25U",
    width: 412,
    height: 915,
    radius: 28,
    safeArea: ANDROID,
    chrome: "notch",
    scale: 3,
  },
  {
    id: "pixel-8",
    family: "android",
    label: "Pixel 8",
    short: "P8",
    width: 412,
    height: 915,
    radius: 40,
    safeArea: ANDROID,
    chrome: "notch",
    scale: 3,
  },
  {
    id: "pixel-9",
    family: "android",
    label: "Pixel 9",
    short: "P9",
    width: 412,
    height: 915,
    radius: 40,
    safeArea: ANDROID,
    chrome: "notch",
    scale: 3,
  },
  {
    id: "pixel-9-pro-xl",
    family: "android",
    label: "Pixel 9 Pro XL",
    short: "P9 XL",
    width: 448,
    height: 998,
    radius: 42,
    safeArea: ANDROID,
    chrome: "notch",
    scale: 3,
  },
  {
    id: "oneplus-12",
    family: "android",
    label: "OnePlus 12",
    short: "OP12",
    width: 450,
    height: 1000,
    radius: 36,
    safeArea: ANDROID,
    chrome: "notch",
    scale: 3,
  },
  {
    id: "xiaomi-14",
    family: "android",
    label: "Xiaomi 14",
    short: "Mi 14",
    width: 393,
    height: 873,
    radius: 38,
    safeArea: ANDROID,
    chrome: "notch",
    scale: 3,
  },
  {
    id: "nothing-phone-2",
    family: "android",
    label: "Nothing Phone (2)",
    short: "NP2",
    width: 412,
    height: 915,
    radius: 36,
    safeArea: ANDROID,
    chrome: "notch",
    scale: 3,
  },

  // ── Tablets ──────────────────────────────────────────────────
  {
    id: "ipad-mini",
    family: "tablet",
    label: "iPad mini",
    short: "mini",
    width: 744,
    height: 1133,
    radius: 24,
    safeArea: TABLET,
    chrome: "none",
    scale: 2,
  },
  {
    id: "ipad-air",
    family: "tablet",
    label: "iPad Air 11″",
    short: "Air",
    width: 820,
    height: 1180,
    radius: 22,
    safeArea: TABLET,
    chrome: "none",
    scale: 2,
  },
  {
    id: "ipad-pro-11",
    family: "tablet",
    label: "iPad Pro 11″",
    short: "Pro 11",
    width: 834,
    height: 1194,
    radius: 20,
    safeArea: TABLET,
    chrome: "none",
    scale: 2,
  },
  {
    id: "ipad-pro-13",
    family: "tablet",
    label: "iPad Pro 13″",
    short: "Pro 13",
    width: 1024,
    height: 1366,
    radius: 20,
    safeArea: TABLET,
    chrome: "none",
    scale: 2,
  },
  {
    id: "galaxy-tab-s9",
    family: "tablet",
    label: "Galaxy Tab S9",
    short: "Tab S9",
    width: 800,
    height: 1280,
    radius: 16,
    safeArea: TABLET,
    chrome: "none",
    scale: 2,
  },
  {
    id: "galaxy-tab-s9-ultra",
    family: "tablet",
    label: "Galaxy Tab S9 Ultra",
    short: "Tab U",
    width: 920,
    height: 1440,
    radius: 16,
    safeArea: TABLET,
    chrome: "none",
    scale: 2,
  },

  // ── Desktop ──────────────────────────────────────────────────
  {
    id: "desktop-hd",
    family: "desktop",
    label: "Desktop HD",
    short: "HD",
    width: 1440,
    height: 900,
    chrome: "none",
  },
  {
    id: "desktop-fhd",
    family: "desktop",
    label: "Desktop Full HD",
    short: "FHD",
    width: 1920,
    height: 1080,
    chrome: "none",
  },
  {
    id: "desktop-qhd",
    family: "desktop",
    label: "Desktop QHD",
    short: "QHD",
    width: 2560,
    height: 1440,
    chrome: "none",
  },
];

/** Primary target for Option B mobile QA. */
export const DEFAULT_DEVICE_ID = "iphone-17-air";

export const IPHONE_17_AIR = DEVICE_PRESETS.find((d) => d.id === "iphone-17-air")!;

export function resolveDeviceId(raw: string | undefined | null): string {
  if (!raw) return DEFAULT_DEVICE_ID;
  if (LEGACY_DEVICE_MAP[raw] && LEGACY_DEVICE_MAP[raw] !== raw) {
    return LEGACY_DEVICE_MAP[raw];
  }
  if (DEVICE_PRESETS.some((d) => d.id === raw)) return raw;
  return DEFAULT_DEVICE_ID;
}

export function getDevice(id: string): DevicePreset {
  const resolved = resolveDeviceId(id);
  return DEVICE_PRESETS.find((d) => d.id === resolved) ?? DEVICE_PRESETS[0];
}

export function devicesByFamily(family: DeviceFamily): DevicePreset[] {
  return DEVICE_PRESETS.filter((d) => d.family === family);
}

export function getSafeArea(device: DevicePreset): SafeAreaInsets {
  return (
    device.safeArea ?? {
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    }
  );
}

/**
 * CSS snippet to inject into preview HTML so content/touch sits below the
 * camera / Dynamic Island and above the Home Indicator.
 */
export function safeAreaCssVars(device: DevicePreset): string {
  const sa = getSafeArea(device);
  return `:root {
  --safe-top: ${sa.top}px;
  --safe-bottom: ${sa.bottom}px;
  --safe-left: ${sa.left}px;
  --safe-right: ${sa.right}px;
  --device-w: ${device.width}px;
  --device-h: ${device.height}px;
}`;
}

/**
 * Inject viewport-fit=cover + simulated safe-area into srcDoc HTML so
 * generated previews respect camera / Dynamic Island.
 *
 * shellReservesBands: Live Preview frame already carves top/bottom bands
 * outside the iframe — only set CSS vars + sticky fixes, do NOT double-pad body.
 */
export function injectSafeAreaIntoHtml(
  html: string,
  device: DevicePreset,
  options?: { shellReservesBands?: boolean },
): string {
  if (!html || device.family === "desktop") return html;
  const sa = getSafeArea(device);
  if (sa.top === 0 && sa.bottom === 0) return html;

  const shell = Boolean(options?.shellReservesBands);
  // When shell owns the bands, body pad is 0 (iframe origin is already below island).
  // Standalone (share / raw srcDoc without bands): pad body + push sticky below island.
  const bodyTop = shell ? 0 : sa.top;
  const bodyBottom = shell ? 0 : sa.bottom;
  // Sticky/fixed top:0 must never sit under the island overlay.
  const stickyTop = shell ? 0 : sa.top;

  const inject = `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<style data-cosy-safe-area>
${safeAreaCssVars(device)}
/* Simulate env(safe-area-inset-*) inside Live Preview iframe */
html {
  --sat: ${sa.top}px;
  --sab: ${sa.bottom}px;
  --sal: ${sa.left}px;
  --sar: ${sa.right}px;
}
/* Touch / content must start BELOW camera (Dynamic Island) */
body {
  padding-top: max(0px, ${bodyTop}px) !important;
  padding-bottom: max(0px, ${bodyBottom}px) !important;
  padding-left: max(0px, ${sa.left}px) !important;
  padding-right: max(0px, ${sa.right}px) !important;
  box-sizing: border-box;
  min-height: 100%;
}
/*
 * Sticky / fixed headers with top:0 paint UNDER the island chrome.
 * Force them to stick at the safe-top edge (or 0 when shell already reserved bands).
 */
header, .topbar, .app-header, .site-header, .navbar,
header.sticky, header[class*="sticky"], nav.sticky, nav[class*="sticky"],
.sticky.top-0, .fixed.top-0, [class*="sticky"][class*="top-0"],
header.fixed, nav.fixed {
  top: ${stickyTop}px !important;
}
/* Prefer explicit safe helpers if authors use them */
.safe-top, .pt-safe { padding-top: ${sa.top}px !important; }
.safe-bottom, .pb-safe { padding-bottom: ${sa.bottom}px !important; }
.safe-x { padding-left: ${sa.left}px !important; padding-right: ${sa.right}px !important; }
</style>`;

  // Upgrade existing viewport meta
  let out = html.replace(
    /<meta\s+name=["']viewport["'][^>]*>/i,
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />`,
  );

  if (/<\/head>/i.test(out)) {
    out = out.replace(/<\/head>/i, `${inject}</head>`);
  } else if (/<body[^>]*>/i.test(out)) {
    out = out.replace(/<body([^>]*)>/i, `${inject}<body$1>`);
  } else {
    out = inject + out;
  }
  return out;
}

export const FAMILY_LABEL: Record<DeviceFamily, string> = {
  iphone: "iPhone",
  android: "Android",
  tablet: "Tablety",
  desktop: "Desktop",
};
