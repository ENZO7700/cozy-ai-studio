import { useEffect, useState } from "react";
import { useStudioStore } from "@/stores/studio-store";
import {
  getWcState,
  retryWebContainerPreview,
  startWebContainerPreview,
  subscribeWc,
  syncWebContainerFiles,
  writeFilesAndReload,
  type WcState,
} from "@/lib/webcontainer/runtime";

export function filesFromStore(): Record<string, string> {
  const s = useStudioStore.getState();
  const out: Record<string, string> = {};
  for (const f of Object.values(s.files)) {
    out[f.path] = f.content;
  }
  if (s.activeFile) {
    out[s.activeFile] =
      s.files[s.activeFile]?.content ?? s.modifiedCode ?? s.originalCode;
  }
  if (!out["src/App.tsx"] && s.originalCode) {
    out["src/App.tsx"] = s.files["src/App.tsx"]?.content ?? s.originalCode;
  }
  return out;
}

/**
 * Boot WebContainer once in Studio; expose status + preview URL.
 * Falls back to srcDoc when WC can't run.
 */
export function useWebContainerPreview() {
  const [wc, setWc] = useState<WcState>(() => getWcState());
  const previewKey = useStudioStore((s) => s.previewKey);

  useEffect(() => subscribeWc(setWc), []);

  // Boot on mount
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const st = getWcState().status;
      if (
        st === "ready" ||
        st === "booting" ||
        st === "installing" ||
        st === "starting"
      ) {
        return;
      }
      const files = filesFromStore();
      if (!cancelled) await startWebContainerPreview(files);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // When previewKey bumps (accept / refresh), sync files if WC ready
  useEffect(() => {
    if (wc.mode !== "webcontainer") return;
    if (wc.status !== "ready" && wc.status !== "syncing") return;
    void syncWebContainerFiles(filesFromStore());
  }, [previewKey, wc.mode, wc.status]);

  return wc;
}

/** Call after Accept — writeFile + reload URL */
export async function pushAcceptedFilesToWebContainer() {
  return writeFilesAndReload(filesFromStore());
}

export async function retryLiveRuntime() {
  return retryWebContainerPreview(filesFromStore());
}
