/**
 * Playground demos of Builder Kernel + Plugin SDK surfaces.
 * Self-contained so the Lab route can showcase breakthrough APIs
 * without pulling the full production kernel.
 */

export type BuilderCommand =
  | { type: "doc.create"; name: string }
  | { type: "node.add"; parentId: string; kind: string; props?: Record<string, string> }
  | { type: "node.move"; id: string; x: number; y: number }
  | { type: "node.set"; id: string; props: Record<string, string> }
  | { type: "export.json" }
  | { type: "ai.plan"; prompt: string };

export type GraphNode = {
  id: string;
  kind: string;
  x: number;
  y: number;
  props: Record<string, string>;
  parentId: string | null;
};

export type BuilderDocument = {
  id: string;
  name: string;
  nodes: GraphNode[];
  revision: number;
};

export type CommandLogEntry = {
  id: string;
  at: number;
  command: BuilderCommand;
  ok: boolean;
  message: string;
};

export class BuilderKernel {
  doc: BuilderDocument;
  log: CommandLogEntry[] = [];
  private seq = 0;

  constructor(name = "Untitled") {
    this.doc = {
      id: `doc_${Date.now().toString(36)}`,
      name,
      nodes: [
        {
          id: "root",
          kind: "frame",
          x: 40,
          y: 40,
          props: { label: "Root frame", w: "320", h: "420" },
          parentId: null,
        },
      ],
      revision: 0,
    };
  }

  dispatch(command: BuilderCommand): CommandLogEntry {
    this.seq += 1;
    const id = `cmd_${this.seq}`;
    let ok = true;
    let message = "";

    try {
      switch (command.type) {
        case "doc.create":
          this.doc.name = command.name;
          this.doc.revision += 1;
          message = `Document “${command.name}” ready`;
          break;
        case "node.add": {
          const node: GraphNode = {
            id: `n_${this.seq}`,
            kind: command.kind,
            x: 60 + (this.doc.nodes.length % 5) * 36,
            y: 80 + this.doc.nodes.length * 28,
            props: command.props ?? { label: command.kind },
            parentId: command.parentId,
          };
          this.doc.nodes.push(node);
          this.doc.revision += 1;
          message = `Added ${command.kind} (${node.id})`;
          break;
        }
        case "node.move": {
          const n = this.doc.nodes.find((x) => x.id === command.id);
          if (!n) throw new Error(`Node ${command.id} missing`);
          n.x = command.x;
          n.y = command.y;
          this.doc.revision += 1;
          message = `Moved ${command.id} → ${command.x},${command.y}`;
          break;
        }
        case "node.set": {
          const n = this.doc.nodes.find((x) => x.id === command.id);
          if (!n) throw new Error(`Node ${command.id} missing`);
          n.props = { ...n.props, ...command.props };
          this.doc.revision += 1;
          message = `Updated props on ${command.id}`;
          break;
        }
        case "export.json":
          message = `Export r${this.doc.revision} · ${this.doc.nodes.length} nodes`;
          break;
        case "ai.plan":
          message = `AI plan queued: “${command.prompt.slice(0, 48)}…”`;
          break;
        default:
          ok = false;
          message = "Unknown command";
      }
    } catch (e) {
      ok = false;
      message = e instanceof Error ? e.message : "Command failed";
    }

    const entry: CommandLogEntry = {
      id,
      at: Date.now(),
      command,
      ok,
      message,
    };
    this.log = [entry, ...this.log].slice(0, 40);
    return entry;
  }

  exportJson(): string {
    return JSON.stringify(
      {
        id: this.doc.id,
        name: this.doc.name,
        revision: this.doc.revision,
        nodes: this.doc.nodes,
      },
      null,
      2,
    );
  }
}

// ── Plugin SDK demo ──────────────────────────────────────────────

export type PluginPermission =
  | "document.read"
  | "document.write"
  | "ai.invoke"
  | "network.http"
  | "ui.overlay";

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  description: string;
  permissions: PluginPermission[];
  author: string;
};

export type PluginState = PluginManifest & {
  enabled: boolean;
  status: "idle" | "running" | "error";
  lastEvent?: string;
};

const CATALOG: PluginManifest[] = [
  {
    id: "plg.a11y-audit",
    name: "A11y Auditor",
    version: "1.2.0",
    description: "Scans the node graph for contrast & focus traps.",
    permissions: ["document.read", "ui.overlay"],
    author: "Cozy Labs",
  },
  {
    id: "plg.token-sync",
    name: "Design Token Sync",
    version: "0.9.4",
    description: "Pushes chocolate/canvas tokens into exported CSS.",
    permissions: ["document.read", "document.write"],
    author: "Cozy Labs",
  },
  {
    id: "plg.mistral-pack",
    name: "Mistral Plan Pack",
    version: "2.0.1",
    description: "Custom plan templates for G0 → G1 streaming.",
    permissions: ["ai.invoke", "document.write"],
    author: "Cozy Labs",
  },
  {
    id: "plg.presence",
    name: "Live Presence",
    version: "1.0.0",
    description: "CRDT-style multiplayer cursors on the canvas.",
    permissions: ["network.http", "ui.overlay", "document.read"],
    author: "Cozy Labs",
  },
];

export class PluginRegistry {
  plugins: PluginState[] = CATALOG.map((p) => ({
    ...p,
    enabled: p.id === "plg.mistral-pack" || p.id === "plg.token-sync",
    status: "idle",
  }));

  toggle(id: string) {
    this.plugins = this.plugins.map((p) =>
      p.id === id
        ? {
            ...p,
            enabled: !p.enabled,
            lastEvent: !p.enabled ? "enabled" : "disabled",
            status: "idle" as const,
          }
        : p,
    );
  }

  async run(id: string): Promise<string> {
    const p = this.plugins.find((x) => x.id === id);
    if (!p) return "Plugin not found";
    if (!p.enabled) return "Enable the plugin first";
    this.plugins = this.plugins.map((x) =>
      x.id === id ? { ...x, status: "running" as const } : x,
    );
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 400));
    const msg =
      id === "plg.a11y-audit"
        ? "3 nodes checked · 0 contrast fails"
        : id === "plg.token-sync"
          ? "Synced 12 tokens → export.css"
          : id === "plg.mistral-pack"
            ? "Loaded 4 plan templates"
            : "3 peers online · CRDT epoch 14";
    this.plugins = this.plugins.map((x) =>
      x.id === id
        ? { ...x, status: "idle" as const, lastEvent: msg }
        : x,
    );
    return msg;
  }
}

// ── Mistral gateway stream demo ──────────────────────────────────

export type StreamPlanMeta = {
  mode: "production" | "demo";
  provider: string;
  detail?: string;
};

/**
 * Stream a plan via POST /api/agents/run (same pipeline as Studio).
 * Falls back to offline demo stream when API unavailable — callers should show "Demo only".
 */
export async function streamMistralPlan(
  prompt: string,
  onToken: (partial: string) => void,
  signal?: AbortSignal,
  onMeta?: (meta: StreamPlanMeta) => void,
): Promise<string> {
  // Try production agents API (SSE)
  try {
    const { getBearerToken } = await import("@/lib/auth/client");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };
    const bearer = getBearerToken();
    if (bearer) headers.Authorization = `Bearer ${bearer}`;

    const res = await fetch("/api/agents/run", {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt: `PLAN ONLY (no full code): ${prompt}`,
        originalCode: "// lab playground plan",
        activeFile: "src/App.tsx",
      }),
      signal,
    });

    if (res.ok && res.body) {
      onMeta?.({ mode: "production", provider: "mistral" });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      while (true) {
        if (signal?.aborted) throw new DOMException("aborted", "AbortError");
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (!block.trim() || block.startsWith(":")) continue;
          let type: string | null = null;
          const dataLines: string[] = [];
          for (const line of block.split("\n")) {
            if (line.startsWith("event:")) type = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
          }
          if (!type || !dataLines.length) continue;
          let data: unknown;
          try {
            data = JSON.parse(dataLines.join("\n"));
          } catch {
            continue;
          }
          if (type === "chat") {
            const c = data as { content?: string };
            if (c.content) {
              acc = acc ? `${acc}\n${c.content}` : c.content;
              onToken(acc);
            }
          } else if (type === "token") {
            const tok = data as { accumulated?: string; token?: string };
            if (tok.accumulated) {
              acc = `## Plan (stream)\n\n${tok.accumulated}`;
              onToken(acc);
            }
          } else if (type === "task") {
            const g = data as { graph?: Array<{ id?: string; label?: string }> };
            if (g.graph?.length) {
              const lines = g.graph.map(
                (n, i) => `${i + 1}. ${n.label || n.id || "task"}`,
              );
              acc = [`## Plan (G0 task graph)`, ``, `Prompt: ${prompt}`, ``, ...lines].join("\n");
              onToken(acc);
            }
          } else if (type === "done") {
            const d = data as { plan?: string; title?: string; description?: string };
            if (d.plan) {
              acc = typeof d.plan === "string" ? d.plan : JSON.stringify(d.plan, null, 2);
            } else if (!acc) {
              acc = [`## Plan`, ``, d.title || prompt, d.description || ""].join("\n");
            }
            onToken(acc);
          } else if (type === "error") {
            const e = data as { userMessage?: string };
            throw new Error(e.userMessage || "Agent pipeline error");
          }
        }
      }
      if (acc) return acc;
    } else {
      // 401/503/409 → demo
      let detail = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { message?: string; error?: string };
        detail = j.message || j.error || detail;
      } catch {
        /* ignore */
      }
      onMeta?.({ mode: "demo", provider: "demo", detail });
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    onMeta?.({
      mode: "demo",
      provider: "demo",
      detail: e instanceof Error ? e.message : String(e),
    });
  }

  // Offline demo stream
  const plan = [
    `## Plan (Demo only)`,
    ``,
    `Prompt: ${prompt}`,
    ``,
    `1. Decompose UI into frame + components`,
    `2. Map chocolate tokens to surfaces`,
    `3. Emit BuilderKernel commands (node.add…)`,
    `4. Run Plugin: Design Token Sync`,
    `5. Export JSON + smoke preview`,
    ``,
    `Provider: demo · connect Mistral + sign in for /api/agents/run`,
  ].join("\n");

  let acc = "";
  for (let i = 0; i < plan.length; i += 6) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    acc = plan.slice(0, i + 6);
    onToken(acc);
    await new Promise((r) => setTimeout(r, 12));
  }
  onToken(plan);
  return plan;
}
