/**
 * Lab Blueprint — snapshot of Builder Kernel + Plugin SDK (+ optional Studio files).
 * Export JSON / ZIP for own projects only (user-generated state).
 */

import type { BuilderKernel, PluginRegistry, PluginState } from "./kernel";
import type { ProjectFile } from "@/stores/studio-store";

export const BLUEPRINT_VERSION = 1 as const;
export const BLUEPRINT_MARKER = "cai-lab-blueprint-v1";

export type LabBlueprint = {
  marker: typeof BLUEPRINT_MARKER;
  version: typeof BLUEPRINT_VERSION;
  id: string;
  name: string;
  createdAt: string;
  source: "lab";
  meta: {
    product: "cozy-ai-studio";
    shellRev: "studio-canvas-1";
    canvas: "#141414";
  };
  document: {
    id: string;
    name: string;
    revision: number;
    nodes: BuilderKernel["doc"]["nodes"];
  };
  commandLog: BuilderKernel["log"];
  plugins: Array<
    Pick<
      PluginState,
      "id" | "name" | "version" | "enabled" | "status" | "lastEvent" | "description"
    >
  >;
  /** Optional snapshot of Studio project files when user opts in */
  studioFiles?: Record<string, ProjectFile>;
  studioActiveFile?: string;
  hashes: {
    documentSha256: string;
    filesSha256: string | null;
  };
};

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Text(text: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return toHex(digest);
  }
  // tiny fallback (not crypto-grade) for non-secure contexts
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (Math.imul(31, h) + text.charCodeAt(i)) | 0;
  }
  return `fallback_${(h >>> 0).toString(16)}`;
}

export async function buildLabBlueprint(opts: {
  kernel: BuilderKernel;
  registry: PluginRegistry;
  name?: string;
  studioFiles?: Record<string, ProjectFile>;
  studioActiveFile?: string;
}): Promise<LabBlueprint> {
  const { kernel, registry } = opts;
  const docPayload = {
    id: kernel.doc.id,
    name: kernel.doc.name,
    revision: kernel.doc.revision,
    nodes: kernel.doc.nodes,
  };
  const documentSha256 = await sha256Text(JSON.stringify(docPayload));
  let filesSha256: string | null = null;
  if (opts.studioFiles && Object.keys(opts.studioFiles).length > 0) {
    filesSha256 = await sha256Text(JSON.stringify(opts.studioFiles));
  }

  const id = `bp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const name =
    opts.name?.trim() ||
    `${kernel.doc.name.replace(/\s+/g, "-").slice(0, 40)}-${id.slice(3, 10)}`;

  return {
    marker: BLUEPRINT_MARKER,
    version: BLUEPRINT_VERSION,
    id,
    name,
    createdAt: new Date().toISOString(),
    source: "lab",
    meta: {
      product: "cozy-ai-studio",
      shellRev: "studio-canvas-1",
      canvas: "#141414",
    },
    document: docPayload,
    commandLog: kernel.log.slice(0, 40),
    plugins: registry.plugins.map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      enabled: p.enabled,
      status: p.status,
      lastEvent: p.lastEvent,
      description: p.description,
    })),
    studioFiles: opts.studioFiles,
    studioActiveFile: opts.studioActiveFile,
    hashes: { documentSha256, filesSha256 },
  };
}

export function isLabBlueprint(v: unknown): v is LabBlueprint {
  if (!v || typeof v !== "object") return false;
  const o = v as LabBlueprint;
  return (
    o.marker === BLUEPRINT_MARKER &&
    o.version === BLUEPRINT_VERSION &&
    !!o.document?.nodes &&
    Array.isArray(o.document.nodes)
  );
}

/** Restore kernel document + plugin enable flags from blueprint */
export function applyLabBlueprint(
  bp: LabBlueprint,
  kernel: BuilderKernel,
  registry: PluginRegistry,
): { nodes: number; plugins: number } {
  kernel.doc = {
    id: bp.document.id,
    name: bp.document.name,
    revision: bp.document.revision,
    nodes: structuredClone(bp.document.nodes),
  };
  kernel.log = (bp.commandLog ?? []).slice(0, 40);
  let plugins = 0;
  for (const snap of bp.plugins ?? []) {
    const p = registry.plugins.find((x) => x.id === snap.id);
    if (p) {
      p.enabled = snap.enabled;
      p.lastEvent = snap.lastEvent ?? `restored from ${bp.id}`;
      p.status = "idle";
      plugins += 1;
    }
  }
  kernel.dispatch({ type: "export.json" });
  return { nodes: kernel.doc.nodes.length, plugins };
}

export function blueprintToJson(bp: LabBlueprint, pretty = true): string {
  return JSON.stringify(bp, null, pretty ? 2 : 0);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadJson(filename: string, json: string) {
  downloadBlob(
    filename,
    new Blob([json], { type: "application/json;charset=utf-8" }),
  );
}

// ── Minimal ZIP (STORE, no compression) ──────────────────────────

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c ^= data[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  return b;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

type ZipEntry = { path: string; data: Uint8Array };

export function buildZip(entries: ZipEntry[]): Blob {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const name = enc.encode(e.path);
    const data = e.data;
    const crc = crc32(data);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0), // store
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ]);
    locals.push(local);
    const central = concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = concat(centrals);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

        const bytes = concat([...locals, centralDir, end]);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: "application/zip" });
}

export async function blueprintToZipBlob(bp: LabBlueprint): Promise<Blob> {
  const enc = new TextEncoder();
  const entries: ZipEntry[] = [
    {
      path: "blueprint.json",
      data: enc.encode(blueprintToJson(bp, true)),
    },
    {
      path: "README.md",
      data: enc.encode(
        [
          `# ${bp.name}`,
          ``,
          `Toto je tvoja kópia z Cozy Labu ✨`,
          ``,
          `ID: ${bp.id}`,
          `Kedy: ${bp.createdAt}`,
          `Kocky na plátne: ${bp.document.nodes.length}`,
          ``,
          `## Ako ju vrátiť späť (3 kroky)`,
          `1. Otvor Cozy Lab → „Kópia magie“`,
          `2. Rozbaľ tento ZIP`,
          `3. Nahraj súbor blueprint.json`,
          ``,
          `Hotovo — magia je späť.`,
          ``,
          `Len tvoje projekty. Nekopíruj cudzie weby.`,
        ]
          .filter(Boolean)
          .join("\n"),
      ),
    },
    {
      path: "document/nodes.json",
      data: enc.encode(JSON.stringify(bp.document, null, 2)),
    },
    {
      path: "plugins/state.json",
      data: enc.encode(JSON.stringify(bp.plugins, null, 2)),
    },
  ];

  if (bp.commandLog?.length) {
    entries.push({
      path: "document/command-log.json",
      data: enc.encode(JSON.stringify(bp.commandLog, null, 2)),
    });
  }

  if (bp.studioFiles) {
    for (const [path, file] of Object.entries(bp.studioFiles)) {
      const safe = path.replace(/^\/+/, "").replace(/\.\./g, "_");
      entries.push({
        path: `studio-files/${safe}`,
        data: enc.encode(file.content ?? ""),
      });
    }
    entries.push({
      path: "studio-files/manifest.json",
      data: enc.encode(
        JSON.stringify(
          {
            activeFile: bp.studioActiveFile ?? null,
            files: Object.values(bp.studioFiles).map((f) => ({
              path: f.path,
              language: f.language,
            })),
          },
          null,
          2,
        ),
      ),
    });
  }

  return buildZip(entries);
}

export function safeFilename(name: string): string {
  return name
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}
