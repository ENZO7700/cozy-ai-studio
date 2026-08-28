import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Sparkles,
  FolderTree,
  FileCode2,
  ChevronDown,
  Coffee,
  LayoutDashboard,
  ShoppingBag,
  Square,
  CheckCircle2,
  Share2,
  ImagePlus,
  X,
  Eraser,
  Wand2,
  Loader2,
  Dices,
  CaseSensitive,
} from "lucide-react";
import { toast } from "sonner";
import {
  useStudioStore,
  type ChatAttachment,
} from "@/stores/studio-store";
import { runStudioPipeline } from "@/lib/ai/run-studio-pipeline";
import { AgentPipeline } from "./AgentPipeline";
import {
  PipelineErrorPanel,
  ErrorHandlingExamples,
  RetryProgressBanner,
} from "./PipelineErrorPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MobilePairPanel } from "./MobilePairPanel";
import { ActivationFunnelCard } from "@/components/studio/ActivationFunnelCard";
import {
  ACCEPTED_IMAGE_ACCEPT,
  MAX_ATTACHMENTS,
  filesToAttachments,
} from "@/lib/media/read-image-attachment";

const TEMPLATES: {
  icon: typeof Coffee;
  title: string;
  prompt: string;
  blurb: string;
}[] = [
  {
    icon: Coffee,
    title: "Kaviareň landing",
    prompt:
      "Landing page for a specialty coffee shop in Košice: hero, menu highlights, hours, contact form. Warm brutalism, chocolate accent, mobile-first.",
    blurb: "Hero + menu + CTA",
  },
  {
    icon: LayoutDashboard,
    title: "SaaS dashboard",
    prompt:
      "Build a clean SaaS metrics dashboard with KPI cards, a simple chart placeholder, recent activity list, and dark-friendly warm palette.",
    blurb: "KPIs + activity",
  },
  {
    icon: ShoppingBag,
    title: "Pricing page",
    prompt:
      "Create a pricing page with Free / Pro / Team cards, feature checklist, and a honest note that Free has a daily AI cap. No fake enterprise claims.",
    blurb: "3 tiers + CTA",
  },
];

export function AgentPanel() {
  const [input, setInput] = useState("");
  const [filesOpen, setFilesOpen] = useState(false);
  const [showErrorDemos, setShowErrorDemos] = useState(false);
  const [pendingMedia, setPendingMedia] = useState<ChatAttachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [cleanArmed, setCleanArmed] = useState(false);
  const [assistBusy, setAssistBusy] = useState<
    "inspire" | "improve" | "diacritics" | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chat = useStudioStore((s) => s.chat);
  const files = useStudioStore((s) => s.files);
  const activeFile = useStudioStore((s) => s.activeFile);
  const setActiveFile = useStudioStore((s) => s.setActiveFile);
  const isPipelineRunning = useStudioStore((s) => s.isPipelineRunning);
  const lastShareUrl = useStudioStore((s) => s.lastShareUrl);
  const lastShareId = useStudioStore((s) => s.lastShareId);
  const cancelPipeline = useStudioStore((s) => s.cancelPipeline);
  const pendingApproval = useStudioStore((s) => s.pendingApproval);
  const setMobilePanel = useStudioStore((s) => s.setMobilePanel);
  const planTier = useStudioStore((s) => s.planTier);
  const promptsUsed = useStudioStore((s) => s.promptsUsed);
  const promptLimit = useStudioStore((s) => s.promptLimit);
  const dailyUsed = useStudioStore((s) => s.dailyUsed);
  const dailyLimit = useStudioStore((s) => s.dailyLimit);
  const lastError = useStudioStore((s) => s.lastPipelineError);
  const cleanEditor = useStudioStore((s) => s.cleanEditor);
  const scrollRef = useRef<HTMLDivElement>(null);
  const consumedLanding = useRef(false);

  const dailyLeft =
    dailyLimit != null ? Math.max(0, dailyLimit - dailyUsed) : null;
  const monthlyLeft = Math.max(0, promptLimit - promptsUsed);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chat, lastError, isPipelineRunning, pendingApproval]);

  useEffect(() => {
    if (consumedLanding.current) return;
    try {
      const q = sessionStorage.getItem("cozy-landing-prompt");
      if (q) {
        consumedLanding.current = true;
        sessionStorage.removeItem("cozy-landing-prompt");
        // Auto-run landing brief for ≤60s TTFP path
        void runStudioPipeline(q.trim(), { autoRetry: true });
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Clean editor: 2nd click must come within 5s
  useEffect(() => {
    if (!cleanArmed) return;
    const t = window.setTimeout(() => setCleanArmed(false), 5000);
    return () => window.clearTimeout(t);
  }, [cleanArmed]);

  const onCleanEditor = () => {
    if (isPipelineRunning) {
      toast.message("Najprv zastav pipeline");
      return;
    }
    if (!cleanArmed) {
      setCleanArmed(true);
      toast.message("Ešte jeden klik", {
        description: "Celá história sa vymaže natrvalo.",
      });
      return;
    }
    cleanEditor();
    setCleanArmed(false);
    setInput("");
    setPendingMedia([]);
    setFilesOpen(false);
    toast.success("Editor je čistý", {
      description: "Chat, súbory, diff a zdieľanie sú preč.",
    });
  };

  const runBriefAssist = useCallback(
    async (mode: "inspire" | "improve" | "diacritics") => {
      if (isPipelineRunning || assistBusy) return;
      if ((mode === "improve" || mode === "diacritics") && !input.trim()) {
        toast.message("Najprv niečo napíš", {
          description:
            mode === "diacritics"
              ? "Diakritika doplní dĺžne/mäkkene bez prepisovania."
              : "Opraviť opraví preklepy a vylepší text podľa Mistral.",
        });
        return;
      }
      setAssistBusy(mode);
      try {
        const res = await fetch("/api/brief-assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, text: input.trim() || undefined }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          text?: string;
          provider?: string;
          error?: string;
          message?: string;
          diacritics?: { applied?: boolean; provider?: string };
        };
        if (!res.ok || !data.text) {
          toast.error(data.message || "Brief assist zlyhal");
          return;
        }
        setInput(data.text);
        const title =
          mode === "inspire"
            ? "Náhodný brief pripravený"
            : mode === "diacritics"
              ? data.diacritics?.applied
                ? "Diakritika doplnená"
                : "Bez zmeny diakritiky"
              : "Preklepy opravené + brief vylepšený";
        toast.success(title, {
          description:
            mode === "diacritics"
              ? data.provider === "mistral"
                ? "Mistral small · bez prepisu"
                : "Lokálny glossary · skontroluj"
              : data.provider === "mistral"
                ? "Mistral · môžeš hneď Send brief"
                : "Lokálny fallback · skontroluj a odošli",
        });
        requestAnimationFrame(() => {
          document.getElementById("studio-brief-prompt")?.focus();
        });
      } catch {
        toast.error("Sieťová chyba pri brief assist");
      } finally {
        setAssistBusy(null);
      }
    },
    [assistBusy, input, isPipelineRunning],
  );

  const addMediaFiles = useCallback(
    async (fileList: FileList | File[] | null | undefined) => {
      if (!fileList || (Array.isArray(fileList) ? fileList.length === 0 : fileList.length === 0)) {
        return;
      }
      const { attachments, errors } = await filesToAttachments(
        fileList,
        pendingMedia.length,
      );
      if (errors.length) {
        toast.message("Some files skipped", {
          description: errors.slice(0, 3).join(" · "),
        });
      }
      if (attachments.length) {
        setPendingMedia((prev) => [...prev, ...attachments].slice(0, MAX_ATTACHMENTS));
      }
    },
    [pendingMedia.length],
  );

  const removeMedia = (id: string) => {
    setPendingMedia((prev) => prev.filter((a) => a.id !== id));
  };

  const run = async (prompt: string, media?: ChatAttachment[]) => {
    if (isPipelineRunning) return;
    const atts = media ?? pendingMedia;
    if (!prompt.trim() && atts.length === 0) return;
    setInput("");
    setPendingMedia([]);
    await runStudioPipeline(prompt, { autoRetry: true, attachments: atts });
  };

  const canSend = Boolean(input.trim()) || pendingMedia.length > 0;

  const userMessages = chat.filter((m) => m.role === "user");
  const showEmpty = userMessages.length === 0 && !isPipelineRunning && !pendingApproval;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-glass)]">
      <div
        ref={scrollRef}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden cosy-scroll"
      >
        <div className="space-y-2.5 p-2.5 sm:p-3 min-w-0">
          <AgentPipeline compact={isPipelineRunning} />
          <RetryProgressBanner />
          <PipelineErrorPanel />

          <div className="flex items-center justify-between gap-2 min-w-0 pt-0.5">
            <div className="flex items-center gap-2 min-w-0">
              <Sparkles className="h-4 w-4 text-choco shrink-0" />
              <span className="font-serif text-sm font-semibold truncate">Brief</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className="text-[11px] text-muted-foreground tabular-nums font-mono"
                title="Quota"
              >
                {planTier === "ENTERPRISE" && monthlyLeft > 100_000
                  ? "SUPER ∞"
                  : `${planTier}${dailyLeft != null ? ` · ${dailyLeft}d` : ""} · ${monthlyLeft}`}
              </span>
              <button
                type="button"
                onClick={onCleanEditor}
                disabled={isPipelineRunning}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium transition-colors",
                  cleanArmed
                    ? "border-destructive/50 bg-destructive/15 text-destructive"
                    : "border-border/80 bg-transparent text-muted-foreground hover:text-foreground hover:border-choco/40",
                )}
                title="Vymazať históriu editora"
                aria-label={cleanArmed ? "Potvrdiť vymazanie" : "Vyčistiť editor"}
              >
                <Eraser className="h-3 w-3" />
                {cleanArmed ? "Naozaj?" : "Clean"}
              </button>
            </div>
          </div>

          {showEmpty && (
            <div className="space-y-2.5 min-w-0">
              <p className="text-sm text-muted-foreground leading-relaxed">
                Popíš UI zmenu — G0→G1→G2 pripraví Diff na Accept.
              </p>
              <div className="flex flex-wrap gap-1.5 min-w-0">
                {TEMPLATES.map((t) => (
                  <button
                    key={t.title}
                    type="button"
                    disabled={isPipelineRunning}
                    onClick={() => void run(t.prompt)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:border-choco/40 transition-colors disabled:opacity-50"
                  >
                    <t.icon className="h-3.5 w-3.5 text-choco shrink-0" />
                    {t.title}
                  </button>
                ))}
              </div>
              {import.meta.env.DEV && (
                <div className="pt-0.5">
                  <button
                    type="button"
                    onClick={() => setShowErrorDemos((v) => !v)}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  >
                    {showErrorDemos ? "Skryť error demos" : "Dev: error demos"}
                  </button>
                  {showErrorDemos && (
                    <div className="mt-2">
                      <ErrorHandlingExamples
                        onRun={(p) => void run(p)}
                        disabled={isPipelineRunning}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {pendingApproval && (
            <div className="rounded-xl border border-success/30 bg-success/10 px-3 py-2.5 text-xs leading-relaxed space-y-2">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                Hotovo — ďalší krok
              </p>
              <ol className="list-decimal list-inside text-muted-foreground space-y-0.5">
                <li>Diff → <strong className="text-foreground">Accept + Share link</strong></li>
                <li>Public URL v clipboard (/a/…)</li>
              </ol>
              <div className="flex flex-wrap gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={() => setMobilePanel("studio")}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium hover:border-choco/40"
                >
                  Diff
                </button>
                <button
                  type="button"
                  onClick={() => setMobilePanel("preview")}
                  className="inline-flex items-center gap-1 rounded-lg border border-success/40 bg-success/15 px-2.5 py-1.5 text-[11px] font-medium"
                >
                  <Share2 className="h-3 w-3" />
                  Náhľad + Share
                </button>
              </div>
            </div>
          )}

          {lastShareUrl && !pendingApproval && (
            <div className="rounded-xl border border-choco/30 bg-choco/10 px-3 py-2.5 text-xs leading-relaxed space-y-2">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <Share2 className="h-3.5 w-3.5 text-choco shrink-0" />
                Verejný odkaz je pripravený
              </p>
              <p className="text-muted-foreground font-mono text-[11px] truncate">
                {lastShareId ? `/a/${lastShareId}` : lastShareUrl}
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={lastShareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-choco/40 bg-background px-2.5 py-1.5 text-[11px] font-medium hover:border-choco"
                >
                  Otvoriť verejný odkaz
                </a>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(lastShareUrl);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium"
                >
                  Kopírovať odkaz
                </button>
              </div>
            </div>
          )}

          <ActivationFunnelCard />

          <div className="space-y-2 min-w-0">
            {chat.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "rounded-xl px-3 py-2.5 text-sm leading-relaxed break-words min-w-0",
                  m.role === "user"
                    ? "bg-choco/10 border border-choco/20"
                    : m.role === "system"
                      ? "bg-muted/60 border border-border text-muted-foreground text-xs"
                      : "bg-background border border-border",
                )}
              >
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {m.attachments.map((a) => (
                      <a
                        key={a.id}
                        href={a.dataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-lg border border-border/80 bg-background"
                        title={a.name}
                      >
                        <img
                          src={a.dataUrl}
                          alt={a.name}
                          className="h-16 w-16 object-cover"
                        />
                      </a>
                    ))}
                  </div>
                )}
                {m.content}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-border min-w-0">
        <button
          type="button"
          onClick={() => setFilesOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground min-w-0"
        >
          <FolderTree className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Súbory</span>
          <span className="font-mono font-normal tabular-nums">
            {Object.keys(files).length}
          </span>
          <ChevronDown
            className={cn(
              "ml-auto h-3.5 w-3.5 shrink-0 transition-transform",
              filesOpen && "rotate-180",
            )}
          />
        </button>
        {filesOpen && (
          <ul className="max-h-28 overflow-auto cosy-scroll px-2 pb-2 space-y-0.5 min-w-0">
            {Object.values(files).map((f) => (
              <li key={f.path} className="min-w-0">
                <button
                  type="button"
                  onClick={() => setActiveFile(f.path)}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                    activeFile === f.path
                      ? "bg-choco/10 text-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <FileCode2 className="h-3.5 w-3.5 shrink-0 text-success" />
                  <span className="truncate font-mono">{f.path}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 px-2.5 sm:px-3 pb-2">
        <MobilePairPanel />
      </div>

      <div
        className={cn(
          "shrink-0 border-t border-border bg-card p-2.5 sm:p-3 min-w-0 transition-colors",
          dragOver && "bg-choco/5 border-choco/40",
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isPipelineRunning) setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (e.currentTarget === e.target) setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          if (isPipelineRunning) return;
          void addMediaFiles(e.dataTransfer.files);
        }}
      >
        {dailyLeft != null && dailyLeft <= 3 && dailyLeft > 0 && (
          <p className="mb-2 text-[11px] text-amber-700 dark:text-amber-400 font-medium">
            {(() => {
              const n = dailyLeft;
              const word =
                n === 1 ? "prompt" : n >= 2 && n <= 4 ? "prompty" : "promptov";
              return `Zostáva ešte ${n} free ${word} dnes`;
            })()}
          </p>
        )}

        {pendingMedia.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingMedia.map((a) => (
              <div
                key={a.id}
                className="group relative h-14 w-14 overflow-hidden rounded-lg border border-border bg-background"
              >
                <img
                  src={a.dataUrl}
                  alt={a.name}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeMedia(a.id)}
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white opacity-90 hover:opacity-100"
                  aria-label={`Remove ${a.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileInputRef}
          id="studio-brief-media"
          name="studio-brief-media"
          type="file"
          accept={ACCEPTED_IMAGE_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => {
            void addMediaFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <div className="flex items-end gap-2 min-w-0">
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="h-11 w-11 shrink-0 rounded-xl"
            disabled={isPipelineRunning || pendingMedia.length >= MAX_ATTACHMENTS}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Add media"
            title="Add image (PNG, JPEG, WebP, GIF)"
          >
            <ImagePlus className="h-4 w-4" />
          </Button>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-center gap-1 px-0.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1 rounded-lg px-2 text-[11px] text-muted-foreground hover:text-foreground"
                disabled={isPipelineRunning || assistBusy !== null}
                onClick={() => void runBriefAssist("inspire")}
                aria-label="Náhodný brief (magic dice)"
                title="Mistral vymyslí náhodný brief — hneď môžeš generovať"
              >
                {assistBusy === "inspire" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Dices className="h-3.5 w-3.5 text-choco" />
                )}
                <span className="hidden xs:inline sm:inline">Inspire</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1 rounded-lg px-2 text-[11px] text-muted-foreground hover:text-foreground"
                disabled={
                  isPipelineRunning ||
                  assistBusy !== null ||
                  !input.trim()
                }
                onClick={() => void runBriefAssist("diacritics")}
                aria-label="Doplň slovenskú diakritiku"
                title="P2: lacný Mistral pass — len diakritika, bez prepisu"
              >
                {assistBusy === "diacritics" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CaseSensitive className="h-3.5 w-3.5 text-choco" />
                )}
                <span className="hidden sm:inline">Diakritika</span>
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 gap-1 rounded-lg px-2 text-[11px] text-muted-foreground hover:text-foreground"
                disabled={
                  isPipelineRunning ||
                  assistBusy !== null ||
                  !input.trim()
                }
                onClick={() => void runBriefAssist("improve")}
                aria-label="Oprav preklepy a vylepši brief"
                title="Opraví preklepy a prepíše brief podľa best-practice (Mistral)"
              >
                {assistBusy === "improve" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5 text-terracotta" />
                )}
                <span className="hidden sm:inline">Opraviť</span>
              </Button>
              <span className="ml-auto hidden text-[10px] text-muted-foreground sm:inline">
                ✨ Mistral
              </span>
            </div>
            <textarea
              id="studio-brief-prompt"
              name="studio-brief-prompt"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                const files: File[] = [];
                for (const item of items) {
                  if (item.kind === "file" && item.type.startsWith("image/")) {
                    const f = item.getAsFile();
                    if (f) files.push(f);
                  }
                }
                if (files.length) {
                  e.preventDefault();
                  void addMediaFiles(files);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && canSend) {
                  e.preventDefault();
                  void run(input.trim());
                }
              }}
              disabled={isPipelineRunning}
              rows={2}
              autoComplete="off"
              placeholder={
                isPipelineRunning
                  ? "Agenti pracujú… Stop vpravo"
                  : "e.g. Warm hero for a pottery studio with terracotta CTA…"
              }
              className="min-h-[2.75rem] max-h-28 min-w-0 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm leading-snug outline-none focus:border-choco focus:ring-1 focus:ring-choco/30 disabled:opacity-60 break-words"
              aria-label="Prompt"
            />
          </div>
          {isPipelineRunning ? (
            <Button
              size="icon"
              variant="secondary"
              className="h-11 w-11 shrink-0"
              onClick={() => cancelPipeline()}
              aria-label="Zastaviť pipeline"
              title="Stop"
            >
              <Square className="h-4 w-4 fill-current" />
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-11 shrink-0 gap-1.5 rounded-xl bg-[#D96B43] px-3.5 text-xs font-semibold text-white hover:bg-[#C85A32] shadow-none"
              disabled={!canSend || assistBusy !== null}
              onClick={() => void run(input.trim())}
              aria-label="Send brief"
            >
              <Send className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Send brief</span>
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Media: PNG · JPEG · WebP · GIF · max {MAX_ATTACHMENTS} · paste or drop
          · 🎲 Inspire · ˇ´ Diakritika · 🪄 Opraviť
        </p>
      </div>
    </div>
  );
}
