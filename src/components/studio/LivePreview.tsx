import { useCallback, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Smartphone,
  Monitor,
  Tablet,
  RotateCw,
  MousePointer2,
  Maximize2,
  ChevronDown,
  Box,
  AlertCircle,
  RefreshCw,
  Share2,
} from "lucide-react";
import { useStudioStore } from "@/stores/studio-store";
import { cn } from "@/lib/utils";
import { sharePreviewHtml } from "@/lib/share-preview";
import {
  DEVICE_PRESETS,
  FAMILY_LABEL,
  getDevice,
  getSafeArea,
  injectSafeAreaIntoHtml,
  resolveDeviceId,
  type DeviceFamily,
  type DevicePreset,
} from "@/lib/devices";
import { useWebContainerPreview, retryLiveRuntime } from "@/hooks/useWebContainerPreview";
import { bustPreviewUrl } from "@/lib/webcontainer/runtime";

const FAMILY_ICON: Record<DeviceFamily, typeof Smartphone> = {
  iphone: Smartphone,
  android: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
};

const FAMILIES: DeviceFamily[] = ["iphone", "android", "tablet", "desktop"];

/** Dynamic Island / camera housing chrome for Live Preview frame. */
function DeviceChrome({ device }: { device: DevicePreset }) {
  const chrome = device.chrome ?? "none";
  if (chrome === "none" || device.family === "desktop") return null;

  if (chrome === "dynamic-island") {
    // iPhone 14 Pro+ / 17 Air — island sits in status bar; touch content starts below safe-top
    return (
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex justify-center"
        data-device-chrome="dynamic-island"
        style={{ height: getSafeArea(device).top }}
        aria-hidden
      >
        <div
          className="mt-[11px] h-[37px] w-[126px] rounded-full bg-black shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
          title="Dynamic Island / camera — touch targets must stay below"
        />
      </div>
    );
  }

  if (chrome === "notch") {
    return (
      <div
        className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex justify-center"
        data-device-chrome="notch"
        style={{ height: getSafeArea(device).top }}
        aria-hidden
      >
        <div className="mt-0 h-[30px] w-[160px] rounded-b-[18px] bg-black" />
      </div>
    );
  }

  // home-button (SE): thin status bar only
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex justify-center py-1.5"
      data-device-chrome="home-button"
      aria-hidden
    >
      <div className="h-1 w-16 rounded-full bg-charcoal/20 dark:bg-white/20" />
    </div>
  );
}

export function LivePreview() {
  const deviceRaw = useStudioStore((s) => s.device);
  const setDevice = useStudioStore((s) => s.setDevice);
  const previewHtml = useStudioStore((s) => s.previewHtml);
  const pendingApproval = useStudioStore((s) => s.pendingApproval);
  // Prefer HitL pending preview (new G1 output) over stale store html
  const activePreviewHtml =
    pendingApproval?.previewHtml?.trim() || previewHtml;
  const previewKey = useStudioStore((s) => s.previewKey);
  const lastShareUrl = useStudioStore((s) => s.lastShareUrl);
  const lastShareId = useStudioStore((s) => s.lastShareId);
  const refreshPreview = useStudioStore((s) => s.refreshPreview);

  const wc = useWebContainerPreview();
  // HitL: always show server-built previewHtml (srcDoc). WC only has OLD files until Accept.
  // Also fall back to srcDoc when WC is error/fallback so Babel overlays never hide a good preview.
  const preferSrcDoc =
    Boolean(activePreviewHtml?.trim()) &&
    (Boolean(pendingApproval) ||
      wc.status === "error" ||
      wc.status === "fallback" ||
      wc.mode === "srcdoc");
  const useWcFrame =
    !preferSrcDoc && wc.mode === "webcontainer" && Boolean(wc.url);

  const deviceId = resolveDeviceId(deviceRaw);
  const current = getDevice(deviceId);
  const safeArea = getSafeArea(current);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [wcUrlBust, setWcUrlBust] = useState(0);
  const iframeEl = useRef<HTMLIFrameElement>(null);

  const grouped = useMemo(() => {
    const map = {} as Record<DeviceFamily, DevicePreset[]>;
    for (const f of FAMILIES) map[f] = [];
    for (const d of DEVICE_PRESETS) map[d.family].push(d);
    return map;
  }, []);

  /** srcDoc: shell reserves safe bands — inject vars + sticky fix, no double body pad */
  const safePreviewHtml = useMemo(() => {
    const chrome = current.chrome ?? "none";
    const shellReserves =
      current.family !== "desktop" && chrome !== "none";
    return injectSafeAreaIntoHtml(activePreviewHtml, current, {
      shellReservesBands: shellReserves,
    });
  }, [activePreviewHtml, current]);

  const pipelinePhase = useStudioStore((s) => s.pipelinePhase);
  // pendingApproval already read above for activePreviewHtml

  const sharePreview = useCallback(async () => {
    await sharePreviewHtml(activePreviewHtml);
  }, [activePreviewHtml]);

  const shareHighlight =
    pipelinePhase === "completed" || Boolean(pendingApproval);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    refreshPreview();
    if (useWcFrame) setWcUrlBust((n) => n + 1);
    setTimeout(() => setIsRefreshing(false), 400);
  }, [refreshPreview, useWcFrame]);

  const onIframeLoad = useCallback(() => {
    if (useWcFrame) return;
    const iframe = iframeEl.current;
    if (!iframe?.contentDocument) return;
    const doc = iframe.contentDocument;

    const handler = (e: MouseEvent) => {
      if (!iframe.dataset.inspect) return;
      e.preventDefault();
      e.stopPropagation();
      const t = e.target as HTMLElement;
      const tag = t.tagName.toLowerCase();
      const cls = typeof t.className === "string" ? t.className.split(" ")[0] : "";
      const label = cls ? `${tag}.${cls}` : tag;
      setSelectedLabel(label);
      doc.querySelectorAll("[data-cosy-inspect]").forEach((el) => {
        (el as HTMLElement).style.outline = "";
        el.removeAttribute("data-cosy-inspect");
      });
      t.style.outline = "2px solid #6b3f24";
      t.style.outlineOffset = "2px";
      t.setAttribute("data-cosy-inspect", "1");
    };

    doc.addEventListener("click", handler, true);
  }, [useWcFrame]);

  const toggleInspect = () => {
    if (useWcFrame) return;
    setInspectMode((v) => {
      const next = !v;
      if (iframeEl.current) {
        if (next) iframeEl.current.dataset.inspect = "1";
        else {
          delete iframeEl.current.dataset.inspect;
          setSelectedLabel(null);
        }
      }
      return next;
    });
  };

  const isDesktop = current.family === "desktop";
  const FamilyIcon = FAMILY_ICON[current.family];

  const selectDevice = (id: string) => {
    setDevice(id);
    setPickerOpen(false);
  };

  const frameStyle: CSSProperties = isDesktop
    ? { width: "100%", height: "100%" }
    : {
        width: `min(${current.width}px, 100%)`,
        maxHeight: "100%",
        aspectRatio: `${current.width} / ${current.height}`,
        borderRadius: current.radius ?? 28,
      };

  const wcSrc =
    useWcFrame && wc.url
      ? bustPreviewUrl(wc.url + (wcUrlBust ? "" : ""))?.replace(
          /([?&])t=\d+/,
          `$1t=${previewKey + wcUrlBust}`,
        ) ?? wc.url
      : null;

  const statusLabel =
    wc.status === "ready"
      ? "Live runtime"
      : wc.status === "fallback"
        ? "Rýchly náhľad"
        : wc.status === "installing"
          ? "Inštalácia…"
          : wc.status === "booting"
            ? "Štart…"
            : wc.status === "starting"
              ? "Vite…"
              : wc.status === "syncing"
                ? "Sync…"
                : wc.status === "checking"
                  ? "Kontrola…"
                  : wc.mode === "srcdoc"
                    ? "Rýchly náhľad"
                    : wc.status;

  const fallbackHint =
    wc.error === "embedded"
      ? "Si vo vnorenom okne (Grok preview). Plný Live Runtime otvor v samostatnom tabe."
      : wc.error === "no-isolation"
        ? "Prehliadač nemá izoláciu stránky (COOP/COEP). Na produkcii v top-level tabe to funguje."
        : wc.error === "no-sab"
          ? "SharedArrayBuffer nie je dostupný v tomto prehliadači."
          : wc.error
            ? String(wc.error)
            : "Live Runtime nie je dostupný — ukazujem rýchly HTML náhľad.";

  const showChrome = !isDesktop && (current.chrome ?? "none") !== "none";

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-glass)]"
      data-preview-device={current.id}
      data-safe-top={safeArea.top}
      data-safe-bottom={safeArea.bottom}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/60 px-3 py-2 sm:px-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-serif text-sm font-semibold shrink-0">Preview</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-mono",
              useWcFrame
                ? "border-success/40 bg-success/10 text-success"
                : wc.status === "error" || wc.status === "fallback"
                  ? "border-border bg-muted text-muted-foreground"
                  : "border-agents-blue/40 bg-agents-blue/10 text-agents-blue",
            )}
            title={wc.error ?? wc.message}
          >
            <Box className="h-3 w-3" />
            {statusLabel}
          </span>
        </div>

        <div className="flex items-center gap-1 min-w-0">
          <div className="relative min-w-0">
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              className={cn(
                "flex max-w-[9.5rem] sm:max-w-[12rem] items-center gap-1.5 rounded-xl border px-2 h-8 text-xs font-medium transition-colors",
                pickerOpen
                  ? "border-choco/40 bg-choco/10 text-foreground"
                  : "border-border bg-background/70 text-foreground hover:border-choco/30",
              )}
              aria-expanded={pickerOpen}
              aria-haspopup="listbox"
              data-device-picker
            >
              <FamilyIcon className="h-3.5 w-3.5 text-success shrink-0" />
              <span className="truncate">{current.label}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                  pickerOpen && "rotate-180",
                )}
              />
            </button>

            {pickerOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40 cursor-default"
                  aria-label="Zavrieť výber zariadenia"
                  onClick={() => setPickerOpen(false)}
                />
                <div
                  role="listbox"
                  className="absolute right-0 top-[calc(100%+6px)] z-50 w-[min(20rem,calc(100vw-2rem))] max-h-[min(22rem,60dvh)] overflow-auto cosy-scroll rounded-2xl border border-border bg-card p-2 shadow-[var(--shadow-elevated)]"
                >
                  {FAMILIES.map((family) => (
                    <div key={family} className="mb-2 last:mb-0">
                      <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {FAMILY_LABEL[family]}
                      </p>
                      <ul className="space-y-0.5">
                        {grouped[family].map((d) => {
                          const active = d.id === deviceId;
                          const sa = getSafeArea(d);
                          return (
                            <li key={d.id}>
                              <button
                                type="button"
                                role="option"
                                aria-selected={active}
                                data-device-option={d.id}
                                onClick={() => selectDevice(d.id)}
                                className={cn(
                                  "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-colors",
                                  active
                                    ? "bg-choco/15 text-foreground"
                                    : "hover:bg-muted text-foreground/90",
                                )}
                              >
                                <span className="min-w-0 flex-1 truncate font-medium">
                                  {d.label}
                                </span>
                                <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
                                  {d.width}×{d.height}
                                  {sa.top > 0 ? ` · T${sa.top}` : ""}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => void sharePreview()}
            className={cn(
              "inline-flex h-8 items-center gap-1 rounded-xl border px-2.5 text-xs font-medium transition-colors shrink-0",
              shareHighlight
                ? "border-success/50 bg-success/15 text-foreground"
                : "border-border bg-background/70 hover:border-choco/40",
            )}
            title="Share preview"
          >
            <Share2 className="h-3.5 w-3.5 text-success" />
            <span className="hidden sm:inline">Share</span>
          </button>

          <button
            type="button"
            title="Refresh"
            onClick={handleRefresh}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-background/70 text-muted-foreground hover:text-foreground shrink-0"
          >
            <RotateCw
              className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
            />
          </button>
        </div>
      </div>

      {lastShareUrl && (
        <div className="flex items-center justify-between gap-2 border-b border-success/25 bg-success/10 px-3 py-1.5 text-[11px]">
          <span className="truncate font-mono text-muted-foreground">
            Zverejnené {lastShareId ? `/a/${lastShareId}` : "odkaz"}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href={lastShareUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-success/40 bg-background px-2 py-0.5 font-medium hover:border-success"
            >
              Otvoriť
            </a>
            <button
              type="button"
              className="rounded-md border border-border bg-background px-2 py-0.5 font-medium"
              onClick={() => void navigator.clipboard.writeText(lastShareUrl)}
            >
              Kopírovať
            </button>
          </div>
        </div>
      )}

      {selectedLabel && inspectMode && (
        <div className="border-b border-border bg-choco/10 px-3 py-1.5 text-xs font-mono text-choco">
          Selected: {selectedLabel}
        </div>
      )}

      {(wc.status === "booting" ||
        wc.status === "installing" ||
        wc.status === "starting" ||
        wc.status === "checking") && (
        <div className="border-b border-border bg-agents-blue/10 px-3 py-2 text-xs text-agents-blue space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-agents-blue agent-pulse" />
            {wc.message}
          </div>
          {wc.steps?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {wc.steps.map((s) => (
                <span
                  key={s.id}
                  className={cn(
                    "rounded-md px-1.5 py-0.5 font-mono text-[10px] border",
                    s.status === "done" &&
                      "border-success/40 bg-success/10 text-success",
                    s.status === "active" &&
                      "border-agents-blue/50 bg-agents-blue/15 text-agents-blue",
                    s.status === "error" &&
                      "border-danger/40 bg-danger/10 text-danger",
                    s.status === "pending" &&
                      "border-border/60 text-muted-foreground",
                  )}
                >
                  {s.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {wc.status === "fallback" && (
        <div className="border-b border-border bg-muted/70 px-3 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-choco" />
            <div className="min-w-0 space-y-1 leading-relaxed">
              <p>
                <span className="font-medium text-foreground">Rýchly náhľad.</span>{" "}
                {fallbackHint}
              </p>
              <p>
                Plný runtime:{" "}
                <a
                  href="https://canvas.h4ck3d.me/studio"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-agents-blue underline underline-offset-2 hover:text-agents-blue-hover"
                >
                  canvas.h4ck3d.me/studio
                </a>
                <span className="text-muted-foreground">
                  {" "}
                  · badge „Live runtime“
                </span>
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-dots-pattern p-3 sm:p-4">
        <div
          className={cn(
            "relative transition-all duration-300 ease-out bg-white dark:bg-canvas-elevated overflow-hidden shadow-[var(--shadow-elevated)]",
            isDesktop
              ? "h-full w-full rounded-xl border border-border"
              : "flex flex-col border-[5px] border-charcoal/20 dark:border-zinc-600",
          )}
          style={frameStyle}
          data-device-frame={current.id}
          data-safe-layout={showChrome ? "bands" : "none"}
        >
          {/* TOP SAFE BAND — island/notch lives here; touch content never paints under camera */}
          {showChrome && safeArea.top > 0 && (
            <div
              className="relative z-20 w-full shrink-0 bg-[#F4F1EA] dark:bg-canvas-elevated"
              style={{ height: safeArea.top }}
              data-safe-band="top"
              aria-hidden
            >
              <DeviceChrome device={current} />
            </div>
          )}

          {/* TOUCH CONTENT — iframe only; starts BELOW Dynamic Island */}
          <div
            className="relative min-h-0 w-full flex-1"
            data-safe-content="1"
            style={
              showChrome
                ? undefined
                : { height: "100%" }
            }
          >
            {useWcFrame && wcSrc ? (
              <iframe
                key={`wc-${previewKey}-${wcUrlBust}`}
                ref={iframeEl}
                title="CAI WebContainer Preview"
                src={wcSrc}
                onLoad={onIframeLoad}
                allow="cross-origin-isolated"
                className="absolute inset-0 h-full w-full border-0 bg-white"
              />
            ) : (
              <iframe
                key={`doc-${previewKey}-${current.id}`}
                ref={iframeEl}
                title="CAI srcDoc Preview"
                srcDoc={safePreviewHtml}
                onLoad={onIframeLoad}
                sandbox="allow-scripts allow-same-origin allow-forms"
                className="absolute inset-0 h-full w-full border-0 bg-white"
                data-safe-preview="1"
              />
            )}
          </div>

          {/* BOTTOM SAFE BAND — home indicator; not part of touch canvas */}
          {showChrome && safeArea.bottom > 0 && (
            <div
              className="relative z-20 flex w-full shrink-0 items-center justify-center bg-[#F4F1EA] dark:bg-canvas-elevated"
              style={{ height: safeArea.bottom }}
              data-safe-band="bottom"
              aria-hidden
            >
              <div
                className="h-[5px] w-[134px] rounded-full bg-black/80 dark:bg-white/70"
                data-home-indicator
              />
            </div>
          )}
        </div>

        <div className="absolute bottom-3 right-3 flex flex-col items-end gap-1 z-10">
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-card/95 px-2.5 py-1.5 text-xs font-mono text-muted-foreground backdrop-blur-sm shadow-sm">
            <Maximize2 className="h-3 w-3 shrink-0" />
            <span className="tabular-nums font-semibold text-foreground">
              {current.width}×{current.height}
            </span>
          </div>
          <div className="rounded-md border border-border/80 bg-card/90 px-2 py-0.5 text-[11px] text-muted-foreground backdrop-blur-sm max-w-[14rem] truncate">
            {current.label}
            {safeArea.top > 0
              ? ` · safe T${safeArea.top}/B${safeArea.bottom}`
              : ""}
          </div>
        </div>
      </div>
    </div>
  );
}
