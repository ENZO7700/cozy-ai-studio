/**
 * iPhone 17 Air / notched iOS safe-area bootstrap.
 *
 * Some in-app browsers report env(safe-area-inset-*) = 0 even with
 * viewport-fit=cover. On tall iPhones we raise CSS fallbacks so chrome
 * never sits under the Dynamic Island / camera.
 *
 * Docs: https://useyourloaf.com/blog/iphone-17-screen-sizes/
 *   iPhone Air: portrait safe top 68 / bottom 34
 */

const AIR_TOP = "68px";
const AIR_BOTTOM = "34px";
const NOTCH_TOP = "59px";
const NOTCH_BOTTOM = "34px";

function readEnvInset(side: "top" | "bottom" | "left" | "right"): number {
  if (typeof document === "undefined") return 0;
  const el = document.createElement("div");
  el.style.cssText = `position:fixed;visibility:hidden;padding-${side}:env(safe-area-inset-${side},0px)`;
  document.documentElement.appendChild(el);
  const v = parseFloat(getComputedStyle(el).getPropertyValue(`padding-${side}`)) || 0;
  el.remove();
  return v;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Logical aspect ≈ tall notched phone (SE is ~1.78; Air/Pro ≥ ~2.0). */
function isTallPhone(): boolean {
  if (typeof window === "undefined") return false;
  const w = Math.min(window.screen.width, window.screen.height);
  const h = Math.max(window.screen.width, window.screen.height);
  if (w < 1) return false;
  return h / w >= 1.95;
}

/** Very tall / wide modern flagship → Air-class top inset (68). */
function isAirClass(): boolean {
  if (typeof window === "undefined") return false;
  const w = Math.min(window.screen.width, window.screen.height);
  const h = Math.max(window.screen.width, window.screen.height);
  // iPhone Air logical 420×912; physical @3x 1260×2736 — screen often reports points or px
  return h / w >= 2.12 || w >= 414;
}

/**
 * Apply fallback CSS vars on <html>. Safe to call multiple times.
 * Returns the effective top/bottom px used for diagnostics.
 */
export function applySafeAreaFallbacks(): { top: number; bottom: number; usedFallback: boolean } {
  if (typeof document === "undefined") {
    return { top: 0, bottom: 0, usedFallback: false };
  }
  const root = document.documentElement;
  const envTop = readEnvInset("top");
  const envBottom = readEnvInset("bottom");

  let usedFallback = false;
  if (isIOS() && isTallPhone() && envTop < 20) {
    const top = isAirClass() ? AIR_TOP : NOTCH_TOP;
    const bottom = envBottom < 10 ? (isAirClass() ? AIR_BOTTOM : NOTCH_BOTTOM) : "0px";
    root.style.setProperty("--sat-fallback", top);
    if (bottom !== "0px") root.style.setProperty("--sab-fallback", bottom);
    usedFallback = true;
  } else {
    root.style.removeProperty("--sat-fallback");
    root.style.removeProperty("--sab-fallback");
  }

  root.setAttribute("data-safe-top", String(Math.max(envTop, usedFallback ? (isAirClass() ? 68 : 59) : 0)));
  root.setAttribute("data-safe-bottom", String(Math.max(envBottom, usedFallback && envBottom < 10 ? 34 : 0)));
  root.setAttribute("data-safe-fallback", usedFallback ? "1" : "0");

  return {
    top: Math.max(envTop, usedFallback ? (isAirClass() ? 68 : 59) : 0),
    bottom: Math.max(envBottom, usedFallback && envBottom < 10 ? 34 : 0),
    usedFallback,
  };
}

/** Call once from root client + on orientation change. */
export function installSafeAreaListener(): () => void {
  if (typeof window === "undefined") return () => {};
  applySafeAreaFallbacks();
  const onChange = () => applySafeAreaFallbacks();
  window.addEventListener("orientationchange", onChange);
  window.addEventListener("resize", onChange);
  // visualViewport shifts when Safari chrome shows/hides
  window.visualViewport?.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("orientationchange", onChange);
    window.removeEventListener("resize", onChange);
    window.visualViewport?.removeEventListener("resize", onChange);
  };
}
