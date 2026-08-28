/** Client-side share of preview HTML — prefers public /a/:id link. */
import { toast } from "sonner";
import { useStudioStore } from "@/stores/studio-store";
import { getActiveProjectId } from "@/hooks/useProjectSync";
import { trackActivation } from "@/lib/activation/client";

export type ShareResult =
  | { mode: "link"; url: string; id: string }
  | { mode: "shared" }
  | { mode: "copied" }
  | { mode: "downloaded" };

export async function createPublicShareLink(opts: {
  html: string;
  title?: string;
  promptPreview?: string;
  sourceCode?: string;
  sourceLanguage?: string;
  sourcePath?: string;
}): Promise<{ url: string; id: string; path: string } | null> {
  try {
    const state = useStudioStore.getState();
    const active = state.activeFile;
    const file = state.files[active];
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        html: opts.html,
        title: opts.title ?? "Cozy preview",
        promptPreview: opts.promptPreview ?? state.lastPrompt?.slice(0, 280),
        projectId: getActiveProjectId(),
        sourceCode:
          opts.sourceCode ??
          state.pendingApproval?.modifiedCode ??
          file?.content ??
          state.modifiedCode,
        sourceLanguage:
          opts.sourceLanguage ??
          state.pendingApproval?.language ??
          file?.language ??
          state.language,
        sourcePath:
          opts.sourcePath ??
          state.pendingApproval?.affectedFiles?.[0] ??
          active,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      ok?: boolean;
      url?: string;
      id?: string;
      path?: string;
    };
    if (!data.ok || !data.url || !data.id) return null;
    try {
      useStudioStore.setState({
        lastShareUrl: data.url,
        lastShareId: data.id,
        lastShareAt: Date.now(),
      });
    } catch {
      /* ignore */
    }
    void trackActivation("share_created", { id: data.id, source: "ui" });
    return { url: data.url, id: data.id, path: data.path ?? `/a/${data.id}` };
  } catch {
    return null;
  }
}

export async function sharePreviewHtml(
  html: string,
  opts?: {
    silent?: boolean;
    title?: string;
    promptPreview?: string;
    preferLink?: boolean;
    sourceCode?: string;
    sourceLanguage?: string;
    sourcePath?: string;
  },
): Promise<ShareResult> {
  const body =
    html?.trim() ||
    "<!doctype html><html><body><p>Empty preview</p></body></html>";

  if (opts?.preferLink !== false) {
    const link = await createPublicShareLink({
      html: body,
      title: opts?.title,
      promptPreview: opts?.promptPreview,
      sourceCode: opts?.sourceCode,
      sourceLanguage: opts?.sourceLanguage,
      sourcePath: opts?.sourcePath,
    });
    if (link) {
      try {
        await navigator.clipboard.writeText(link.url);
        if (!opts?.silent) {
          toast.success("Public link copied", {
            description: link.path,
            action: {
              label: "Open",
              onClick: () => window.open(link.url, "_blank", "noopener"),
            },
          });
        }
        return { mode: "link", url: link.url, id: link.id };
      } catch {
        if (!opts?.silent) {
          toast.success("Share link ready", {
            description: link.url,
            action: {
              label: "Open",
              onClick: () => window.open(link.url, "_blank", "noopener"),
            },
          });
        }
        return { mode: "link", url: link.url, id: link.id };
      }
    }
  }

  const blob = new Blob([body], { type: "text/html;charset=utf-8" });
  const file = new File([blob], "cozy-preview.html", { type: "text/html" });

  try {
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: opts?.title ?? "Cozy AI Studio preview",
        files: [file],
      });
      if (!opts?.silent) toast.success("Shared preview HTML");
      return { mode: "shared" };
    }
  } catch {
    /* cancelled */
  }

  try {
    await navigator.clipboard.writeText(body);
    if (!opts?.silent) {
      toast.success("Preview HTML copied", {
        description:
          "Public link unavailable — pasted full HTML. Host deploy still not live.",
      });
    }
    return { mode: "copied" };
  } catch {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cozy-preview.html";
    a.click();
    URL.revokeObjectURL(url);
    if (!opts?.silent) toast.success("Downloaded cozy-preview.html");
    return { mode: "downloaded" };
  }
}

/** Normalize sourceCode from API (string | accidental object | JSON map). */
function resolveSourceCode(
  raw: unknown,
  preferredPath: string,
  html: string,
): { path: string; code: string; language: string } {
  const fallback = {
    path: preferredPath || "src/App.tsx",
    language: "tsx",
    code: `export default function App() {\n  return (\n    <div dangerouslySetInnerHTML={{ __html: ${JSON.stringify(html || "")} }} />\n  );\n}\n`,
  };

  if (raw == null) return fallback;

  // Plain source string
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return fallback;
    // Accidental JSON-serialized file map from older bug
    if (trimmed.startsWith("{") && trimmed.includes(":")) {
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const keys = Object.keys(parsed);
          const primary =
            keys.find((k) => k === preferredPath) ||
            keys.find((k) => /App\.(tsx|jsx|ts|js)$/i.test(k)) ||
            keys[0];
          const val = primary != null ? parsed[primary] : null;
          if (typeof val === "string" && val.trim()) {
            const lang = primary.endsWith(".css")
              ? "css"
              : primary.endsWith(".json")
                ? "json"
                : "tsx";
            return { path: primary, code: val, language: lang };
          }
        }
      } catch {
        /* treat as normal source */
      }
    }
    // Valid TSX/JS source
    if (
      trimmed.includes("export") ||
      trimmed.includes("function") ||
      trimmed.includes("const ") ||
      trimmed.includes("<")
    ) {
      return { path: preferredPath || "src/App.tsx", code: trimmed, language: "tsx" };
    }
    // Unknown string — still use it rather than crash
    return { path: preferredPath || "src/App.tsx", code: trimmed, language: "tsx" };
  }

  // Object map path → content
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const map = raw as Record<string, unknown>;
    const keys = Object.keys(map);
    const primary =
      keys.find((k) => k === preferredPath) ||
      keys.find((k) => /App\.(tsx|jsx|ts|js)$/i.test(k)) ||
      keys[0];
    const val = primary != null ? map[primary] : null;
    if (typeof val === "string" && val.trim()) {
      const lang = primary!.endsWith(".css")
        ? "css"
        : primary!.endsWith(".json")
          ? "json"
          : "tsx";
      return { path: primary!, code: val, language: lang };
    }
  }

  return fallback;
}

/** Apply a public share into the current studio session (Remix). Open demo — no auth. */
export async function applyShareRemix(shareId: string): Promise<boolean> {
  const id = shareId?.trim();
  if (!id) return false;

  try {
    const res = await fetch(`/api/share?id=${encodeURIComponent(id)}`);
    if (!res.ok) return false;
    const data = (await res.json()) as {
      ok?: boolean;
      html?: string;
      title?: string;
      sourceCode?: string | Record<string, string> | null;
      sourceLanguage?: string | null;
      sourcePath?: string | null;
      promptPreview?: string | null;
    };
    if (!data.ok) return false;

    const html = typeof data.html === "string" ? data.html : "";
    const preferredPath =
      (typeof data.sourcePath === "string" && data.sourcePath.trim()) ||
      "src/App.tsx";
    const resolved = resolveSourceCode(data.sourceCode, preferredPath, html);
    const language =
      (typeof data.sourceLanguage === "string" && data.sourceLanguage.trim()) ||
      resolved.language;

    const state = useStudioStore.getState();
    const files = {
      ...state.files,
      [resolved.path]: {
        path: resolved.path,
        language,
        content: resolved.code,
      },
    };

    useStudioStore.setState({
      files,
      activeFile: resolved.path,
      originalCode: resolved.code,
      modifiedCode: resolved.code,
      language,
      previewHtml: html || state.previewHtml,
      previewKey: state.previewKey + 1,
      lastPrompt: data.promptPreview?.trim() || state.lastPrompt,
      // clear any pending HitL from previous session
      pendingApproval: null,
      preflightReport: null,
      mobilePanel: "preview",
    });

    // Do NOT set cozy-landing-prompt — that would auto-run pipeline.
    // Remix only hydrates code + preview.

    toast.success("Remix loaded — uprav a Share znova", {
      description: resolved.path,
    });
    void trackActivation("remix_opened", {
      shareId: id,
      source: "ui",
      path: resolved.path,
    });
    return true;
  } catch {
    return false;
  }
}
