/**
 * Canvas Live Runtime Kernel — WebContainer boot → mount → npm i → Vite → iframe URL.
 * Snapshot / restore, retry, writeFile on Accept + reload.
 */

import type { WebContainer, WebContainerProcess } from "@webcontainer/api";
import {
  buildBaseProjectFiles,
  toFileSystemTree,
  type FlatFiles,
} from "./project-template";

export type WcStatus =
  | "idle"
  | "checking"
  | "booting"
  | "installing"
  | "starting"
  | "ready"
  | "syncing"
  | "fallback"
  | "error";

export type WcStepId = "check" | "boot" | "mount" | "install" | "dev" | "ready";

export type WcStep = {
  id: WcStepId;
  label: string;
  status: "pending" | "active" | "done" | "error" | "skip";
};

export type WcState = {
  status: WcStatus;
  url: string | null;
  error: string | null;
  mode: "webcontainer" | "srcdoc";
  message: string;
  steps: WcStep[];
  retryCount: number;
  lastSyncAt: number | null;
};

type Listener = (state: WcState) => void;

const listeners = new Set<Listener>();

const DEFAULT_STEPS: WcStep[] = [
  { id: "check", label: "Runtime", status: "pending" },
  { id: "boot", label: "Boot", status: "pending" },
  { id: "mount", label: "Mount", status: "pending" },
  { id: "install", label: "npm i", status: "pending" },
  { id: "dev", label: "Vite", status: "pending" },
  { id: "ready", label: "Ready", status: "pending" },
];

function cloneSteps(): WcStep[] {
  return DEFAULT_STEPS.map((s) => ({ ...s }));
}

let state: WcState = {
  status: "idle",
  url: null,
  error: null,
  mode: "srcdoc",
  message: "Preview idle",
  steps: cloneSteps(),
  retryCount: 0,
  lastSyncAt: null,
};

let bootPromise: Promise<void> | null = null;
let wc: WebContainer | null = null;
let devProc: WebContainerProcess | null = null;
let lastMounted = new Map<string, string>();
/** Snapshot of flat files at last good ready state */
let snapshotFlat: FlatFiles | null = null;
let serverReadyHandler: ((port: number, url: string) => void) | null = null;

function setState(patch: Partial<WcState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l(state);
}

function setStep(id: WcStepId, status: WcStep["status"]) {
  const steps = state.steps.map((s) =>
    s.id === id ? { ...s, status } : s,
  );
  setState({ steps });
}

export function getWcState(): WcState {
  return state;
}

export function subscribeWc(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

export function isWebContainerSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (!globalThis.crossOriginIsolated) return false;
  if (typeof SharedArrayBuffer === "undefined") return false;
  return true;
}

async function ensureBooted(): Promise<WebContainer> {
  if (wc) return wc;
  if (bootPromise) {
    await bootPromise;
    if (!wc) throw new Error("WebContainer boot failed");
    return wc;
  }

  bootPromise = (async () => {
    setStep("boot", "active");
    setState({
      status: "booting",
      message: "Booting WebContainer…",
      error: null,
      mode: "webcontainer",
    });
    const { WebContainer } = await import("@webcontainer/api");
    // Match vercel.json COEP: credentialless (enables crossOriginIsolated in modern Chrome)
    wc = await WebContainer.boot({ coep: "credentialless" });
    wc.on("error", (err) => {
      console.error("[webcontainer]", err);
      setState({
        status: "error",
        error: err.message || "WebContainer error",
        message: "WebContainer error",
      });
    });
    setStep("boot", "done");
  })();

  try {
    await bootPromise;
  } catch (e) {
    bootPromise = null;
    wc = null;
    setStep("boot", "error");
    throw e;
  }

  if (!wc) throw new Error("WebContainer boot failed");
  return wc;
}

async function spawnAndWait(
  instance: WebContainer,
  cmd: string,
  args: string[],
): Promise<number> {
  const proc = await instance.spawn(cmd, args);
  proc.output
    .pipeTo(
      new WritableStream({
        write() {
          /* drain */
        },
      }),
    )
    .catch(() => undefined);
  return proc.exit;
}

/**
 * Boot WC, mount project, npm install, start Vite, resolve preview URL.
 */
export async function startWebContainerPreview(
  files: FlatFiles,
  opts?: { force?: boolean },
): Promise<WcState> {
  if (
    !opts?.force &&
    (state.status === "booting" ||
      state.status === "installing" ||
      state.status === "starting")
  ) {
    return state;
  }
  if (!opts?.force && state.status === "ready" && state.url && wc) {
    return state;
  }

  setState({ steps: cloneSteps(), error: null });

  if (!isWebContainerSupported()) {
    setStep("check", "error");
    const inIframe =
      typeof window !== "undefined" && window.self !== window.top;
    const reason = !globalThis.crossOriginIsolated
      ? inIframe
        ? "embedded"
        : "no-isolation"
      : "no-sab";
    setState({
      status: "fallback",
      mode: "srcdoc",
      url: null,
      message: "Live static preview",
      error: reason,
    });
    return state;
  }

  try {
    setStep("check", "active");
    setState({ status: "checking", message: "Checking runtime…", error: null });
    setStep("check", "done");

    const instance = await ensureBooted();

    const flat = buildBaseProjectFiles(
      files["src/App.tsx"] || files["App.tsx"],
      files,
    );
    const tree = toFileSystemTree(flat);

    setStep("mount", "active");
    setState({ status: "installing", message: "Mounting files…", mode: "webcontainer" });
    await instance.mount(tree);
    lastMounted = new Map(Object.entries(flat));
    setStep("mount", "done");

    setStep("install", "active");
    setState({ status: "installing", message: "npm install…" });
    const installCode = await spawnAndWait(instance, "npm", ["install"]);
    if (installCode !== 0) {
      setStep("install", "error");
      throw new Error(`npm install failed (exit ${installCode})`);
    }
    setStep("install", "done");

    if (devProc) {
      try {
        devProc.kill();
      } catch {
        /* ignore */
      }
      devProc = null;
    }

    setStep("dev", "active");
    setState({ status: "starting", message: "Starting Vite…" });

    const urlPromise = new Promise<string>((resolve, reject) => {
      const t = setTimeout(
        () => reject(new Error("Timed out waiting for Vite server")),
        60_000,
      );
      const handler = (_port: number, url: string) => {
        clearTimeout(t);
        resolve(url);
      };
      serverReadyHandler = handler;
      instance.on("server-ready", handler);
    });

    devProc = await instance.spawn("npm", ["run", "dev"]);
    devProc.output
      .pipeTo(
        new WritableStream({
          write() {
            /* swallow */
          },
        }),
      )
      .catch(() => undefined);

    const url = await urlPromise;
    setStep("dev", "done");
    setStep("ready", "done");
    snapshotFlat = { ...flat };
    setState({
      status: "ready",
      url,
      mode: "webcontainer",
      message: "WebContainer ready",
      error: null,
      lastSyncAt: Date.now(),
    });
    return state;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[webcontainer] start failed", e);
    setState({
      status: "fallback",
      mode: "srcdoc",
      url: null,
      error: msg,
      message: "Live static preview",
    });
    return state;
  }
}

/** Retry full boot — always tear down then reboot (force). */
export async function retryWebContainerPreview(
  files: FlatFiles,
): Promise<WcState> {
  setState({ retryCount: state.retryCount + 1 });
  try {
    devProc?.kill();
  } catch {
    /* */
  }
  devProc = null;
  try {
    wc?.teardown();
  } catch {
    /* */
  }
  wc = null;
  bootPromise = null;
  lastMounted.clear();
  snapshotFlat = null;
  return startWebContainerPreview(files, { force: true });
}

async function ensureParentDirs(
  instance: WebContainer,
  filePath: string,
): Promise<void> {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length <= 1) return;
  let cur = "";
  for (let i = 0; i < parts.length - 1; i++) {
    cur = cur ? `${cur}/${parts[i]}` : parts[i]!;
    try {
      await instance.fs.mkdir(cur);
    } catch {
      /* exists */
    }
  }
}

/**
 * Write changed files into the running container (Accept path).
 */
export async function syncWebContainerFiles(
  files: FlatFiles,
): Promise<void> {
  if (!wc || state.mode !== "webcontainer") return;
  if (state.status === "fallback" || state.status === "idle") return;

  setState({ status: "syncing", message: "Syncing files…" });
  try {
    const flat = buildBaseProjectFiles(
      files["src/App.tsx"] || files["App.tsx"],
      files,
    );

    for (const [path, content] of Object.entries(flat)) {
      const prev = lastMounted.get(path);
      if (prev === content) continue;
      await ensureParentDirs(wc, path);
      await wc.fs.writeFile(path, content);
      lastMounted.set(path, content);
    }

    snapshotFlat = { ...flat };
    setState({
      status: "ready",
      message: "Files synced",
      mode: "webcontainer",
      lastSyncAt: Date.now(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    setState({
      status: "error",
      error: msg,
      message: "Sync failed",
    });
  }
}

/**
 * Accept path: writeFile all + force iframe reload URL.
 */
export async function writeFilesAndReload(
  files: FlatFiles,
): Promise<string | null> {
  await syncWebContainerFiles(files);
  if (state.url) {
    return bustPreviewUrl(state.url);
  }
  return null;
}

/** Restore last snapshot into WC (undo bad agent apply in container only). */
export async function restoreWcSnapshot(): Promise<boolean> {
  if (!wc || !snapshotFlat) return false;
  try {
    await syncWebContainerFiles(snapshotFlat);
    return true;
  } catch {
    return false;
  }
}

export function getWcSnapshot(): FlatFiles | null {
  return snapshotFlat ? { ...snapshotFlat } : null;
}

export function bustPreviewUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.searchParams.set("t", String(Date.now()));
    return u.toString();
  } catch {
    return `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
  }
}

export async function teardownWebContainer(): Promise<void> {
  try {
    devProc?.kill();
  } catch {
    /* ignore */
  }
  devProc = null;
  try {
    wc?.teardown();
  } catch {
    /* ignore */
  }
  wc = null;
  bootPromise = null;
  lastMounted.clear();
  snapshotFlat = null;
  serverReadyHandler = null;
  setState({
    status: "idle",
    url: null,
    error: null,
    mode: "srcdoc",
    message: "Preview idle",
    steps: cloneSteps(),
    lastSyncAt: null,
  });
}
