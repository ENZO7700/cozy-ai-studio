import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Boxes,
  Braces,
  Cable,
  Cpu,
  Download,
  FileJson,
  GitBranch,
  Layers,
  Package,
  Play,
  Plug,
  Power,
  Sparkles,
  Square,
  Upload,
  Users,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CozyLogo } from "@/components/brand/CozyLogo";
import { cn } from "@/lib/utils";
import {
  BuilderKernel,
  PluginRegistry,
  streamMistralPlan,
  type PluginState,
  type StreamPlanMeta,
} from "@/lib/playground/kernel";
import { useP2PRoom } from "@/lib/multiplayer";
import {
  applyLabBlueprint,
  blueprintToJson,
  blueprintToZipBlob,
  buildLabBlueprint,
  downloadBlob,
  downloadJson,
  isLabBlueprint,
  safeFilename,
  type LabBlueprint,
} from "@/lib/playground/blueprint";
import { useStudioStore } from "@/stores/studio-store";

export const Route = createFileRoute("/playground")({
  component: PlaygroundPage,
  head: () => ({
    meta: [
      { title: "Experimental sandbox — Cozy AI Studio" },
      {
        name: "description",
        content:
          "Frozen library demos (Kernel / Plugin / multiplayer). Not the product path — use Studio.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
});

type LabTab = "kernel" | "plugins" | "ai" | "canvas" | "presence" | "blueprint";

const TABS: {
  id: LabTab;
  label: string;
  icon: typeof Cpu;
  blurb: string;
}[] = [
  {
    id: "kernel",
    label: "Kernel (lib)",
    icon: Cpu,
    blurb: "Library demo — not product editor",
  },
  {
    id: "plugins",
    label: "Plugins (lib)",
    icon: Plug,
    blurb: "SDK sandbox only",
  },
  {
    id: "ai",
    label: "AI plan stream",
    icon: Sparkles,
    blurb: "Dev stream — Studio is primary",
  },
  {
    id: "canvas",
    label: "Nodes canvas",
    icon: Layers,
    blurb: "Internal node stage",
  },
  {
    id: "presence",
    label: "Presence",
    icon: Users,
    blurb: "Experimental multiplayer",
  },
  {
    id: "blueprint",
    label: "Export JSON/ZIP",
    icon: Package,
    blurb: "Local export only",
  },
];

function PlaygroundPage() {
  const [tab, setTab] = useState<LabTab>("kernel");
  const kernelRef = useRef(new BuilderKernel("Cosy Lab Doc"));
  const pluginsRef = useRef(new PluginRegistry());
  const [, bump] = useState(0);
  const refresh = () => bump((n) => n + 1);

  const kernel = kernelRef.current;
  const registry = pluginsRef.current;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Home</span>
            </Link>
            <div className="h-5 w-px bg-border" />
            <div className="flex items-center gap-2 min-w-0">
              <CozyLogo size="sm" variant="seal" />
              <div className="min-w-0">
                <p className="font-serif text-lg font-bold leading-tight truncate">
                  Experimental sandbox
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  Frozen · not the product path
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/studio">
              <Button size="sm" className="h-9 gap-1.5">
                <Wand2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Back to Studio</span>
                <span className="sm:hidden">Studio</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10">
        <div
          role="status"
          className="mb-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed"
        >
          <p className="font-semibold text-foreground">
            Not product — library demos only
          </p>
          <p className="text-muted-foreground mt-1">
            Builder Kernel, Plugin SDK, CRDT/multiplayer and marketplace are{" "}
            <strong className="text-foreground font-medium">frozen</strong> out of
            the Speed Studio spine. Product path is{" "}
            <Link to="/studio" className="underline underline-offset-2 text-foreground">
              Studio
            </Link>{" "}
            (brief → preview → share). Do not market these panels as shipped features.
          </p>
        </div>
        <div className="mb-8 max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-choco mb-2">
            Dev sandbox · noindex
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight leading-tight mb-3">
            Internal experiments (frozen for S1)
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed">
            These modules exist for engineering exploration. They are not the
            demo, not the CTA, and not sold. Prefer Studio for Brief → preview → share.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-5 lg:gap-6 min-h-[70dvh]">
          <aside className="lg:w-72 shrink-0">
            <nav className="flex lg:flex-col gap-2 overflow-x-auto cosy-scroll pb-1 lg:pb-0">
              {TABS.map(({ id, label, icon: Icon, blurb }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    "flex min-w-[11rem] lg:min-w-0 items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors",
                    tab === id
                      ? "border-choco/40 bg-choco/10"
                      : "border-border bg-card hover:border-choco/30",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 mt-0.5 shrink-0",
                      tab === id ? "text-choco" : "text-muted-foreground",
                    )}
                  />
                  <span>
                    <span className="block text-sm font-semibold leading-snug">
                      {label}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-1 leading-snug">
                      {blurb}
                    </span>
                  </span>
                </button>
              ))}
            </nav>

            <div className="mt-4 hidden lg:block rounded-2xl border border-choco/20 bg-choco/5 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-choco mb-2">
                Tip dňa
              </p>
              <p className="text-sm text-foreground leading-relaxed">
                Najprv si pohraj na plátne. Potom otvor{" "}
                <span className="font-semibold">Kópia magie</span> a ulož si
                všetko na jeden klik.
              </p>
            </div>
          </aside>

          <main className="min-w-0 flex-1 rounded-3xl border border-border bg-card shadow-[var(--shadow-glass)] overflow-hidden flex flex-col">
            {tab === "kernel" && <KernelPanel kernel={kernel} onChange={refresh} />}
            {tab === "plugins" && (
              <PluginsPanel
                registry={registry}
                plugins={registry.plugins}
                onChange={refresh}
              />
            )}
            {tab === "ai" && <AiPanel kernel={kernel} onKernelChange={refresh} />}
            {tab === "canvas" && <CanvasPanel kernel={kernel} onChange={refresh} />}
            {tab === "presence" && <PresencePanel />}
            {tab === "blueprint" && (
              <BlueprintPanel
                kernel={kernel}
                registry={registry}
                onChange={refresh}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

function PanelChrome({
  title,
  subtitle,
  children,
  actions,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border bg-muted/40 px-4 sm:px-6 py-4">
        <div className="min-w-0 max-w-xl">
          <h2 className="font-serif text-xl font-bold leading-snug">{title}</h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            {subtitle}
          </p>
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      <div className="min-h-0 flex-1 p-4 sm:p-6">{children}</div>
    </>
  );
}

function KernelPanel({
  kernel,
  onChange,
}: {
  kernel: BuilderKernel;
  onChange: () => void;
}) {
  const run = (cmd: Parameters<BuilderKernel["dispatch"]>[0]) => {
    const entry = kernel.dispatch(cmd);
    onChange();
    toast[entry.ok ? "success" : "error"](entry.message);
  };

  return (
    <PanelChrome
      title="Kernel (library demo)"
      subtitle="Add UI pieces with commands. Watch the graph and the command history update."
      actions={
        <>
          <Button
            size="sm"
            variant="secondary"
            className="h-9"
            onClick={() =>
              run({
                type: "node.add",
                parentId: "root",
                kind: "text",
                props: { label: "Headline" },
              })
            }
          >
            Add text
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-9"
            onClick={() =>
              run({
                type: "node.add",
                parentId: "root",
                kind: "button",
                props: { label: "CTA", variant: "primary" },
              })
            }
          >
            Add button
          </Button>
          <Button
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => {
              run({ type: "export.json" });
              navigator.clipboard?.writeText(kernel.exportJson()).catch(() => {});
              toast.message("Copied JSON to clipboard");
            }}
          >
            <Braces className="h-3.5 w-3.5" />
            Export JSON
          </Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <p className="text-sm font-semibold mb-2">
            Node graph
            <span className="font-normal text-muted-foreground">
              {" "}
              · version {kernel.doc.revision}
            </span>
          </p>
          <div className="rounded-2xl border border-border bg-canvas p-3 min-h-[300px] relative overflow-hidden">
            {kernel.doc.nodes.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() =>
                  run({
                    type: "node.move",
                    id: n.id,
                    x: n.x + 12,
                    y: n.y + 8,
                  })
                }
                className={cn(
                  "absolute rounded-xl border px-3 py-2 text-left shadow-sm transition-transform hover:-translate-y-0.5",
                  n.kind === "frame"
                    ? "border-choco/50 bg-choco/25 text-canvas-fg"
                    : "border-white/20 bg-canvas-elevated text-canvas-fg",
                )}
                style={{ left: n.x, top: n.y, minWidth: 104 }}
              >
                <span className="block text-xs uppercase tracking-wide opacity-80">
                  {n.kind}
                </span>
                <span className="block text-sm font-medium mt-0.5">
                  {n.props.label ?? n.id}
                </span>
              </button>
            ))}
            <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 text-xs text-canvas-muted">
              <GitBranch className="h-3.5 w-3.5 shrink-0" />
              <span>
                {kernel.doc.name} · {kernel.doc.nodes.length} nodes · click a node
                to move it
              </span>
            </div>
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold mb-2">Command history</p>
          <div className="rounded-2xl border border-border bg-muted/40 max-h-[300px] overflow-auto cosy-scroll divide-y divide-border">
            {kernel.log.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground leading-relaxed">
                No commands yet. Use the buttons above to add a node or export.
              </p>
            )}
            {kernel.log.map((e) => (
              <div key={e.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-semibold text-choco">
                    {e.command.type}
                  </span>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      e.ok ? "text-success" : "text-danger",
                    )}
                  >
                    {e.ok ? "OK" : "Failed"}
                  </span>
                </div>
                <p className="text-sm leading-relaxed">{e.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PanelChrome>
  );
}

function PluginsPanel({
  registry,
  plugins,
  onChange,
}: {
  registry: PluginRegistry;
  plugins: PluginState[];
  onChange: () => void;
}) {
  return (
    <PanelChrome
      title="Plugin SDK (library demo)"
      subtitle="Internal sandbox only — not a marketplace or product feature."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {plugins.map((p) => (
          <article
            key={p.id}
            className={cn(
              "rounded-2xl border p-4 sm:p-5 flex flex-col gap-3",
              p.enabled
                ? "border-choco/35 bg-choco/5"
                : "border-border bg-background/50",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-serif text-lg font-semibold leading-snug">
                  {p.name}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {p.author} · v{p.version}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  registry.toggle(p.id);
                  onChange();
                }}
                className={cn(
                  "rounded-full p-2.5 border transition-colors shrink-0",
                  p.enabled
                    ? "border-choco/40 bg-choco text-white"
                    : "border-border text-muted-foreground",
                )}
                aria-label={p.enabled ? "Disable plugin" : "Enable plugin"}
              >
                <Power className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {p.description}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {p.permissions.map((perm) => (
                <span
                  key={perm}
                  className="rounded-md border border-border bg-muted/60 px-2 py-1 text-xs text-muted-foreground"
                >
                  {perm}
                </span>
              ))}
            </div>
            <div className="mt-auto flex items-center justify-between gap-3 pt-2">
              <span className="text-xs text-muted-foreground truncate leading-snug">
                {p.lastEvent ?? "Not run yet"}
              </span>
              <Button
                size="sm"
                variant="secondary"
                className="h-9 gap-1.5 shrink-0"
                disabled={!p.enabled || p.status === "running"}
                onClick={async () => {
                  const msg = await registry.run(p.id);
                  onChange();
                  toast.success(msg);
                }}
              >
                {p.status === "running" ? (
                  "Running…"
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5" /> Run
                  </>
                )}
              </Button>
            </div>
          </article>
        ))}
      </div>
    </PanelChrome>
  );
}

function AiPanel({
  kernel,
  onKernelChange,
}: {
  kernel: BuilderKernel;
  onKernelChange: () => void;
}) {
  const [prompt, setPrompt] = useState("Pricing section with chocolate tokens");
  const [stream, setStream] = useState("");
  const [running, setRunning] = useState(false);
  const [planMeta, setPlanMeta] = useState<StreamPlanMeta | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setStream("");
    setPlanMeta(null);
    const ac = new AbortController();
    abortRef.current = ac;
    kernel.dispatch({ type: "ai.plan", prompt });
    onKernelChange();
    try {
      await streamMistralPlan(prompt, setStream, ac.signal, setPlanMeta);
      kernel.dispatch({
        type: "node.add",
        parentId: "root",
        kind: "section",
        props: { label: "From AI plan" },
      });
      onKernelChange();
      toast.success("Plan finished. A new node was added to the graph.");
    } catch {
      toast.message("Stream stopped");
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [prompt, running, kernel, onKernelChange]);

  return (
    <PanelChrome
      title="AI Gateway"
      subtitle="Mistral-only planning. Type a goal, stream the plan, and send a node into the kernel."
      actions={
        running ? (
          <Button
            size="sm"
            variant="danger"
            className="h-9 gap-1.5"
            onClick={() => abortRef.current?.abort()}
          >
            <Square className="h-3.5 w-3.5" />
            Stop
          </Button>
        ) : (
          <Button size="sm" className="h-9 gap-1.5" onClick={() => void start()}>
            <Sparkles className="h-3.5 w-3.5" />
            Stream plan
          </Button>
        )
      }
    >
      <div className="space-y-4 max-w-3xl">
        <label className="block space-y-2">
          <span className="text-sm font-semibold">What should we plan?</span>
          <input
            id="playground-plan-prompt"
            name="playground-plan-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="h-12 w-full rounded-xl border border-border bg-background px-3.5 text-base outline-none focus:border-choco focus:ring-1 focus:ring-choco/30"
            placeholder="e.g. Pricing section with three tiers"
            autoComplete="off"
          />
        </label>
        <div className="rounded-2xl border border-border bg-canvas min-h-[260px] p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3 text-xs text-canvas-muted flex-wrap">
            <Cable className="h-3.5 w-3.5 text-success shrink-0" />
            {planMeta?.mode === "production" ? (
              <span>
                Provider: <span className="text-success font-medium">Mistral</span>
                {" · "}
                <span className="font-mono">/api/agents/run</span>
              </span>
            ) : planMeta?.mode === "demo" ? (
              <span>
                <span className="rounded-full bg-amber-500/20 text-amber-200 px-2 py-0.5 font-semibold">
                  Demo only
                </span>
                {" · "}
                offline stream
                {planMeta.detail ? (
                  <span className="opacity-70"> · {planMeta.detail.slice(0, 80)}</span>
                ) : null}
              </span>
            ) : (
              <span>Provider: Mistral · will use /api/agents/run or Demo only</span>
            )}
          </div>
          <pre className="whitespace-pre-wrap font-sans text-sm sm:text-[15px] leading-relaxed text-[#f0ece6]">
            {stream || "The plan will appear here when you start the stream."}
            {running && (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-choco align-middle animate-pulse" />
            )}
          </pre>
        </div>
      </div>
    </PanelChrome>
  );
}

function CanvasPanel({
  kernel,
  onChange,
}: {
  kernel: BuilderKernel;
  onChange: () => void;
}) {
  const artifacts = useMemo(() => kernel.doc.nodes, [kernel.doc.nodes, kernel.doc.revision]);

  return (
    <PanelChrome
      title="Studio Canvas"
      subtitle="Working stage on canvas grey. Drop artifacts and see them on the board."
      actions={
        <Button
          size="sm"
          className="h-9 gap-1.5"
          onClick={() => {
            kernel.dispatch({
              type: "node.add",
              parentId: "root",
              kind: "card",
              props: { label: `Artifact ${kernel.doc.nodes.length}` },
            });
            onChange();
          }}
        >
          <Boxes className="h-3.5 w-3.5" />
          Drop artifact
        </Button>
      }
    >
      <div className="rounded-2xl border border-border bg-dots-pattern min-h-[380px] relative overflow-hidden">
        {artifacts.map((n) => (
          <div
            key={n.id}
            className={cn(
              "absolute rounded-2xl border shadow-[var(--shadow-elevated)] px-3.5 py-2.5",
              n.kind === "frame"
                ? "border-choco/40 bg-choco/20 text-canvas-fg min-w-[150px] min-h-[110px]"
                : "border-white/15 bg-canvas-elevated text-canvas-fg",
            )}
            style={{ left: n.x, top: n.y }}
          >
            <p className="text-xs uppercase tracking-wide opacity-70">{n.kind}</p>
            <p className="text-sm font-medium mt-0.5">{n.props.label ?? n.id}</p>
          </div>
        ))}
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-2">
          <span className="rounded-lg border border-white/15 bg-black/50 backdrop-blur px-2.5 py-1.5 text-xs text-canvas-fg">
            Canvas grey #141414
          </span>
          <span className="rounded-lg border border-white/15 bg-black/50 backdrop-blur px-2.5 py-1.5 text-xs text-canvas-fg">
            {kernel.doc.nodes.length} pieces · version {kernel.doc.revision}
          </span>
        </div>
      </div>
    </PanelChrome>
  );
}

function PresencePanel() {
  const [displayName] = useState(
    () => `Guest-${Math.random().toString(36).slice(2, 6)}`,
  );
  const p2p = useP2PRoom({ name: displayName, room: "cai-lab" });
  const [cursors, setCursors] = useState<
    Record<string, { x: number; y: number; name: string; color: string }>
  >({});
  const boardRef = useRef<HTMLDivElement>(null);
  const colors = ["#c48a5a", "#4ade80", "#60a5fa", "#f472b6", "#fbbf24"];

  useEffect(() => {
    return p2p.onMessage((from, data, channel) => {
      if (channel !== "state") return;
      const d = data as { x?: number; y?: number; name?: string };
      if (typeof d.x !== "number" || typeof d.y !== "number") return;
      const color = colors[Math.abs(hashCode(from)) % colors.length]!;
      setCursors((prev) => ({
        ...prev,
        [from]: {
          x: d.x!,
          y: d.y!,
          name: d.name || from.slice(0, 8),
          color,
        },
      }));
    });
  }, [p2p.onMessage]);

  // Drop peers that left
  useEffect(() => {
    const ids = new Set(p2p.peers.map((p) => p.id));
    setCursors((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        if (!ids.has(id)) delete next[id];
      }
      return next;
    });
  }, [p2p.peers]);

  const onMove = (e: React.PointerEvent) => {
    const el = boardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    p2p.broadcast({ x, y, name: displayName });
  };

  return (
    <PanelChrome
      title="Multiplayer"
      subtitle="WebRTC mesh via /api/rtc signaling. Move your cursor — peers see it P2P."
    >
      <div
        ref={boardRef}
        onPointerMove={onMove}
        className="rounded-2xl border border-border bg-dots-pattern min-h-[380px] relative overflow-hidden cursor-crosshair"
      >
        {Object.entries(cursors).map(([id, p]) => (
          <div
            key={id}
            className="absolute flex items-center gap-2 pointer-events-none transition-all duration-75"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            <span
              className="h-3.5 w-3.5 rounded-full ring-2 ring-white/40 agent-pulse"
              style={{ background: p.color }}
            />
            <span
              className="rounded-md px-2 py-1 text-xs font-medium text-white shadow"
              style={{ background: p.color }}
            >
              {p.name}
            </span>
          </div>
        ))}
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-2">
          <span className="rounded-xl border border-white/15 bg-black/55 backdrop-blur px-3.5 py-2.5 text-sm text-canvas-fg">
            <Users className="inline h-4 w-4 mr-2 text-success align-text-bottom" />
            {p2p.joined ? "Signaling joined" : "Connecting…"} · {p2p.peers.length}{" "}
            peer(s)
          </span>
          <span className="rounded-xl border border-white/15 bg-black/55 backdrop-blur px-3.5 py-2.5 text-xs font-mono text-canvas-fg">
            room {p2p.room} · you {p2p.selfId}
          </span>
          {p2p.peers.map((peer) => (
            <span
              key={peer.id}
              className="rounded-xl border border-white/15 bg-black/55 backdrop-blur px-2.5 py-2 text-xs text-canvas-fg"
            >
              {peer.name || peer.id.slice(0, 8)} · {peer.connectionState}
              {peer.rttMs != null ? ` · ${peer.rttMs}ms` : ""}
            </span>
          ))}
        </div>
      </div>
    </PanelChrome>
  );
}


function BlueprintPanel({
  kernel,
  registry,
  onChange,
}: {
  kernel: import("@/lib/playground/kernel").BuilderKernel;
  registry: import("@/lib/playground/kernel").PluginRegistry;
  onChange: () => void;
}) {
  const [name, setName] = useState("Moja super kópia");
  const [includeStudio, setIncludeStudio] = useState(true);
  const [preview, setPreview] = useState<LabBlueprint | null>(null);
  const [busy, setBusy] = useState(false);
  const [stepGlow, setStepGlow] = useState<1 | 2 | 3 | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const studioFiles = useStudioStore((s) => s.files);
  const activeFile = useStudioStore((s) => s.activeFile);
  const setFiles = useStudioStore((s) => s.setFiles);
  const setActiveFile = useStudioStore((s) => s.setActiveFile);

  const pieceCount = kernel.doc.nodes.length;
  const pluginOn = registry.plugins.filter((p) => p.enabled).length;

  const build = useCallback(async () => {
    setBusy(true);
    setStepGlow(1);
    try {
      const bp = await buildLabBlueprint({
        kernel,
        registry,
        name,
        studioFiles: includeStudio ? studioFiles : undefined,
        studioActiveFile: includeStudio ? activeFile : undefined,
      });
      setPreview(bp);
      return bp;
    } finally {
      setBusy(false);
    }
  }, [kernel, registry, name, includeStudio, studioFiles, activeFile]);

  const exportJson = async () => {
    const bp = preview ?? (await build());
    if (!bp) return;
    setStepGlow(2);
    downloadJson(
      `${safeFilename(bp.name) || "moja-kopia"}.json`,
      blueprintToJson(bp),
    );
    toast.success("Hotovo! Súbor je u teba 🎉", {
      description: "Ako fotka tvojho projektu — JSON",
    });
  };

  const exportZip = async () => {
    const bp = preview ?? (await build());
    if (!bp) return;
    setBusy(true);
    setStepGlow(2);
    try {
      const blob = await blueprintToZipBlob(bp);
      downloadBlob(`${safeFilename(bp.name) || "moja-kopia"}.zip`, blob);
      toast.success("WOW — balíček je pripravený!", {
        description: "ZIP ako darček. Otvor ho kedykoľvek.",
      });
    } finally {
      setBusy(false);
    }
  };

  const onImportFile = async (file: File) => {
    try {
      if (file.name.endsWith(".zip")) {
        toast.message("Najprv rozbaľ ZIP", {
          description: "Potom nahraj súbor blueprint.json",
        });
        return;
      }
      const text = await file.text();
      const data = JSON.parse(text) as unknown;
      if (!isLabBlueprint(data)) {
        toast.error("Toto nie je naša kópia", {
          description: "Vyber súbor z Cozy Labu",
        });
        return;
      }
      setStepGlow(3);
      const r = applyLabBlueprint(data, kernel, registry);
      if (data.studioFiles && Object.keys(data.studioFiles).length > 0) {
        setFiles(data.studioFiles);
        if (data.studioActiveFile) setActiveFile(data.studioActiveFile);
      }
      setPreview(data);
      onChange();
      toast.success("Magia sa vrátila!", {
        description: `${r.nodes} kociek je späť na plátne`,
      });
    } catch {
      toast.error("Súbor sa nepodarilo prečítať");
    }
  };

  return (
    <PanelChrome
      title="Ulož si magiu"
      subtitle="Ako LEGO stavbu v krabičke. Uložíš → stiahneš → nabudúce všetko nasypeš späť. Super jednoduché."
      actions={
        <>
          <Button
            size="sm"
            className="h-10 gap-1.5 min-w-[7.5rem]"
            disabled={busy}
            onClick={() =>
              void build().then((bp) => {
                if (bp)
                  toast.success("Kópia je hotová!", {
                    description: "Teraz ju môžeš stiahnuť",
                  });
              })
            }
          >
            <Sparkles className="h-3.5 w-3.5" />
            1 · Vytvor kópiu
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-10 gap-1.5"
            disabled={busy}
            onClick={() => void exportZip()}
          >
            <Download className="h-3.5 w-3.5" />
            2 · Stiahni balík
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-10 gap-1.5"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            3 · Nahraj späť
          </Button>
          <input
            ref={fileRef}
            id="playground-import-json"
            name="playground-import-json"
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
              e.target.value = "";
            }}
          />
        </>
      }
    >
      <div className="space-y-6 max-w-3xl">
        {/* Hero pitch */}
        <div className="relative overflow-hidden rounded-3xl border border-choco/25 bg-gradient-to-br from-choco/15 via-card to-card p-5 sm:p-6">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-choco/10 blur-2xl pointer-events-none" />
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-choco mb-2">
            Killer feature · Cozy Lab
          </p>
          <h3 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight leading-tight mb-2">
            Tvoja práca v jednej krabičke
          </h3>
          <p className="text-base text-muted-foreground leading-relaxed max-w-xl">
            Predstav si, že celý projekt zbalíš do vrecka. Potom ho kdekoľvek
            znova postavíš — ako kúzelník s klobúkom.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { n: "1", t: "Vytvor" },
              { n: "2", t: "Stiahni" },
              { n: "3", t: "Vráť späť" },
            ].map((s) => (
              <span
                key={s.n}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors",
                  stepGlow === Number(s.n)
                    ? "border-choco bg-choco text-white"
                    : "border-border bg-background/80 text-foreground",
                )}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-choco/15 text-xs font-bold text-choco">
                  {s.n}
                </span>
                {s.t}
              </span>
            ))}
          </div>
        </div>

        {/* Name + studio toggle */}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold">Ako sa bude kópia volať?</span>
            <input
              id="playground-clone-name"
              name="cloneName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Napr. Moja prvá appka"
              className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-base outline-none focus:border-choco focus:ring-2 focus:ring-choco/25"
              autoComplete="off"
            />
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3 cursor-pointer min-h-12 hover:border-choco/40 transition-colors">
            <input
              id="playground-include-studio"
              name="includeStudio"
              type="checkbox"
              checked={includeStudio}
              onChange={(e) => setIncludeStudio(e.target.checked)}
              className="h-5 w-5 accent-[var(--color-choco,#6b3f24)]"
            />
            <span className="text-sm leading-snug">
              <span className="font-semibold">Pridaj aj Studio súbory</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                {Object.keys(studioFiles).length} súborov zo Studio — kód ide so sebou
              </span>
            </span>
          </label>
        </div>

        {/* Big action cards */}
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void build().then((bp) => {
                if (bp)
                  toast.success("Kópia je hotová!", {
                    description: "Teraz ju môžeš stiahnuť",
                  });
              })
            }
            className="group rounded-2xl border border-border bg-card p-4 text-left hover:border-choco/50 hover:shadow-[var(--shadow-elevated)] transition-all disabled:opacity-60"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-choco/15 text-choco mb-3 group-hover:scale-105 transition-transform">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="block font-serif text-lg font-bold">Odfot stav</span>
            <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">
              Urobíme snímku toho, čo máš teraz na plátne.
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void exportZip()}
            className="group rounded-2xl border border-choco/30 bg-choco/10 p-4 text-left hover:bg-choco/15 hover:shadow-[var(--shadow-elevated)] transition-all disabled:opacity-60"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-choco text-white mb-3 group-hover:scale-105 transition-transform">
              <Package className="h-5 w-5" />
            </span>
            <span className="block font-serif text-lg font-bold">Balíček ZIP</span>
            <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">
              Najlepší darček — všetko v jednom súbore.
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void exportJson()}
            className="group rounded-2xl border border-border bg-card p-4 text-left hover:border-choco/50 hover:shadow-[var(--shadow-elevated)] transition-all disabled:opacity-60"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground mb-3 group-hover:scale-105 transition-transform">
              <FileJson className="h-5 w-5" />
            </span>
            <span className="block font-serif text-lg font-bold">Ľahký JSON</span>
            <span className="block text-xs text-muted-foreground mt-1 leading-relaxed">
              Pre zvedavcov — text, ktorý vieš otvoriť.
            </span>
          </button>
        </div>

        {/* Live stats + preview */}
        <div className="rounded-3xl border border-border bg-canvas p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-serif text-lg font-bold text-canvas-fg">
              Čo je v krabičke?
            </p>
            <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-xs text-canvas-muted">
              tvoje · nie cudzie weby
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Kocky na plátne", value: String(pieceCount) },
              { label: "Zapnuté pluginy", value: `${pluginOn}` },
              {
                label: "Studio súbory",
                value: includeStudio
                  ? String(Object.keys(studioFiles).length)
                  : "0",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-2xl border border-white/10 bg-black/35 px-3 py-3 text-center"
              >
                <p className="font-serif text-2xl font-bold text-canvas-fg tabular-nums">
                  {s.value}
                </p>
                <p className="text-[11px] text-canvas-muted mt-1 leading-snug">
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          {preview ? (
            <div className="space-y-2 animate-in fade-in duration-300">
              <p className="text-sm font-semibold text-success">
                ✓ Kópia „{preview.name}“ je pripravená
              </p>
              <p className="text-xs text-canvas-muted leading-relaxed">
                Môžeš ju stiahnuť. Alebo ju neskôr nahrať a všetko sa vráti —
                kocky, pluginy, súbory.
              </p>
              <details className="group">
                <summary className="cursor-pointer text-xs text-canvas-muted hover:text-canvas-fg list-none flex items-center gap-1.5">
                  <Braces className="h-3.5 w-3.5" />
                  Ukázka pre zvedavcov (technický text)
                </summary>
                <pre className="mt-2 max-h-40 overflow-auto cosy-scroll rounded-xl bg-black/50 p-3 text-[10px] font-mono text-[#e8e4de] leading-relaxed">
                  {blueprintToJson(preview).slice(0, 1200)}
                  {blueprintToJson(preview).length > 1200 ? "\n…" : ""}
                </pre>
              </details>
            </div>
          ) : (
            <p className="text-sm text-canvas-muted leading-relaxed">
              Ešte nič nie je v krabičke. Klikni{" "}
              <strong className="text-canvas-fg">„1 · Vytvor kópiu“</strong> —
              urobíme snímku za sekundu.
            </p>
          )}
        </div>

        {/* Restore CTA */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 rounded-2xl border border-dashed border-choco/35 bg-choco/5 p-4">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Už máš kópiu z minula?</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              Nahraj JSON súbor a plátno sa naplní samo. Ako „undo“ pre celý deň.
            </p>
          </div>
          <Button
            className="h-11 gap-2 shrink-0"
            variant="secondary"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Nahrať kópiu
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground leading-relaxed px-2">
          Len tvoje veci z Cozy Lab / Studio. Žiadne kopírovanie cudzích stránok —
          čistá hra s vlastným dielom.
        </p>
      </div>
    </PanelChrome>
  );
}

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
