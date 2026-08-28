/**
 * Hydrate studio files/approvals/telemetry from server DB.
 * Works in open demo (AUTH_PROVIDER=none → dev-user) and signed-in modes.
 * Persist file writes server-side (not only localStorage cozy-ai-studio-v1).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useStudioStore, type PlanTier, type ProjectFile } from "@/stores/studio-store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  loadMyWorkspace,
  recordMyTelemetry,
  resolveMyApproval,
  saveMyProjectFiles,
  createMyApproval,
} from "@/lib/db/functions";

const PROJECT_ID_KEY = "cai-active-project-id";

export function useProjectSync() {
  const { user, isPending } = useCurrentUserState();
  const [projectId, setProjectId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(PROJECT_ID_KEY);
    } catch {
      return null;
    }
  });
  const [hydrated, setHydrated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshot = useRef<string>("");
  const hydratedOnce = useRef(false);

  // Hydrate from server when we have a user (incl. open-demo DEV_USER)
  useEffect(() => {
    if (isPending) return;
    if (!user) {
      setHydrated(true);
      return;
    }
    // Avoid re-hydrate loop when projectId updates from this effect
    if (hydratedOnce.current) return;

    let cancelled = false;
    setSyncing(true);
    setCloudError(null);
    void loadMyWorkspace({ data: projectId })
      .then((ws) => {
        if (cancelled) return;
        hydratedOnce.current = true;
        setProjectId(ws.project.id);
        try {
          window.localStorage.setItem(PROJECT_ID_KEY, ws.project.id);
        } catch {
          /* ignore */
        }

        const filesMap: Record<string, ProjectFile> = {};
        for (const f of ws.files) {
          filesMap[f.path] = {
            path: f.path,
            language: f.language,
            content: f.content,
          };
        }

        const active = ws.project.active_file || "src/App.tsx";
        const activeContent =
          filesMap[active]?.content ??
          Object.values(filesMap)[0]?.content ??
          useStudioStore.getState().originalCode;

        const hasCloudFiles = Object.keys(filesMap).length > 0;

        useStudioStore.setState({
          activeFile: active,
          files: hasCloudFiles ? filesMap : useStudioStore.getState().files,
          originalCode: hasCloudFiles
            ? activeContent
            : useStudioStore.getState().originalCode,
          modifiedCode: hasCloudFiles
            ? activeContent
            : useStudioStore.getState().modifiedCode,
          planTier:
            (ws.subscription?.plan_tier as PlanTier) ||
            (ws.project.plan_tier as PlanTier) ||
            "FREE",
          promptsUsed: ws.usage.promptsUsed,
          telemetry: ws.recentTelemetry.map((t) => ({
            id: t.id,
            prompt: t.prompt,
            status: t.status as "APPROVED" | "REJECTED",
            rejectionReason: (t.rejection_reason as never) ?? null,
            agentType: t.agent_type,
            latencyMs: t.latency_ms,
            createdAt: Date.parse(t.created_at) || Date.now(),
          })),
        });

        // Restore pending HitL card if any
        const pending = ws.pendingApprovals[0];
        if (pending) {
          let affected: string[] = [];
          try {
            affected = JSON.parse(pending.affected_files_json) as string[];
          } catch {
            affected = [];
          }
          useStudioStore.setState({
            pendingApproval: {
              title: pending.title,
              description: pending.description,
              affectedFiles: affected,
              originalCode: pending.original_code,
              modifiedCode: pending.modified_code,
              language: pending.language,
              previewHtml: pending.preview_html || "",
            },
            originalCode: pending.original_code,
            modifiedCode: pending.modified_code,
            language: pending.language,
          });
          try {
            window.sessionStorage.setItem("cai-pending-approval-id", pending.id);
          } catch {
            /* ignore */
          }
        }

        lastSnapshot.current = JSON.stringify(
          hasCloudFiles ? filesMap : useStudioStore.getState().files,
        );
        setHydrated(true);

        // First cloud project: push local starter files so refresh has content
        if (!hasCloudFiles) {
          const state = useStudioStore.getState();
          const files = Object.values(state.files).map((f) => ({
            path: f.path,
            language: f.language,
            content: f.content,
          }));
          if (files.length > 0) {
            void saveMyProjectFiles({
              data: {
                projectId: ws.project.id,
                files,
                activeFile: state.activeFile,
              },
            }).catch((e) =>
              console.warn("[project-sync] seed save failed", e),
            );
          }
        }
      })
      .catch((e) => {
        console.warn("[project-sync] hydrate failed", e);
        setCloudError(e instanceof Error ? e.message : "Cloud hydrate failed");
        setHydrated(true);
      })
      .finally(() => {
        if (!cancelled) setSyncing(false);
      });

    return () => {
      cancelled = true;
    };
    // projectId only as initial seed from localStorage — do not re-run on set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isPending]);

  // Debounced persist files → server
  const persistFiles = useCallback(async () => {
    if (!user || !projectId) return;
    const state = useStudioStore.getState();
    const files = Object.values(state.files).map((f) => ({
      path: f.path,
      language: f.language,
      content: f.content,
    }));
    const snap = JSON.stringify(
      Object.fromEntries(files.map((f) => [f.path, f])),
    );
    if (snap === lastSnapshot.current) return;
    lastSnapshot.current = snap;
    try {
      await saveMyProjectFiles({
        data: {
          projectId,
          files,
          activeFile: state.activeFile,
        },
      });
      setCloudError(null);
    } catch (e) {
      console.warn("[project-sync] save failed", e);
      setCloudError(e instanceof Error ? e.message : "Cloud save failed");
    }
  }, [user, projectId]);

  // Watch store file changes
  useEffect(() => {
    if (!hydrated || !user || !projectId) return;
    const unsub = useStudioStore.subscribe((s, prev) => {
      if (s.files === prev.files && s.activeFile === prev.activeFile) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void persistFiles();
      }, 800);
    });
    return () => {
      unsub();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [hydrated, user, projectId, persistFiles]);

  return { projectId, hydrated, syncing, persistFiles, cloudError };
}

/** Create server approval when HitL card is shown */
export async function persistPendingApproval(opts: {
  projectId: string | null;
  title: string;
  description: string;
  affectedFiles: string[];
  originalCode: string;
  modifiedCode: string;
  language: string;
  previewHtml: string;
}) {
  try {
    const row = await createMyApproval({
      data: {
        projectId: opts.projectId,
        title: opts.title,
        description: opts.description,
        affectedFiles: opts.affectedFiles,
        originalCode: opts.originalCode,
        modifiedCode: opts.modifiedCode,
        language: opts.language,
        previewHtml: opts.previewHtml,
      },
    });
    try {
      window.sessionStorage.setItem("cai-pending-approval-id", row.id);
    } catch {
      /* ignore */
    }
    return row.id;
  } catch {
    return null;
  }
}

export async function resolveServerApproval(
  status: "approved" | "rejected",
  rejectionReason?: string | null,
) {
  let approvalId: string | null = null;
  try {
    approvalId = window.sessionStorage.getItem("cai-pending-approval-id");
  } catch {
    approvalId = null;
  }
  if (!approvalId) return;
  try {
    await resolveMyApproval({
      data: { approvalId, status, rejectionReason },
    });
    window.sessionStorage.removeItem("cai-pending-approval-id");
  } catch (e) {
    console.warn("[project-sync] resolve approval", e);
  }
}

export async function persistTelemetry(entry: {
  prompt: string;
  status: "APPROVED" | "REJECTED";
  rejectionReason?: string | null;
  agentType: string;
  latencyMs: number;
  projectId?: string | null;
}) {
  try {
    await recordMyTelemetry({ data: entry });
  } catch {
    /* offline */
  }
}

export function getActiveProjectId(): string | null {
  try {
    return window.localStorage.getItem(PROJECT_ID_KEY);
  } catch {
    return null;
  }
}
