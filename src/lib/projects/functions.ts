/**
 * Client-safe project server functions.
 * Handlers dynamically import ./server so pg / pglite never enter the
 * client graph (fixes createRequire crash on /studio).
 */
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

export const listMyProjects = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { listProjectsForUser } = await import("./server");
    return listProjectsForUser(context.userId);
  });

export const ensureMyProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { ensureDefaultProject } = await import("./server");
    return ensureDefaultProject(context.userId);
  });

export const getMyProject = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((projectId: string) => projectId)
  .handler(async ({ context, data: projectId }) => {
    const { getProjectForUser } = await import("./server");
    return getProjectForUser(context.userId, projectId);
  });

export const saveMyProject = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      projectId: string;
      filesJson: string;
      activeFile?: string;
      name?: string;
      planTier?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const { saveProjectFiles } = await import("./server");
    return saveProjectFiles(context.userId, data.projectId, {
      filesJson: data.filesJson,
      activeFile: data.activeFile,
      name: data.name,
      planTier: data.planTier,
    });
  });

export const getMyUsage = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { getMonthlyUsage } = await import("./server");
    return getMonthlyUsage(context.userId);
  });

export const recordMyPromptUsage = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      projectId?: string | null;
      promptPreview?: string;
      tokensIn?: number;
      tokensOut?: number;
      model?: string;
      agent?: string;
      provider?: string;
    }) => input,
  )
  .handler(async ({ context, data }) => {
    const { recordUsageEvent, getMonthlyUsage } = await import("./server");
    await recordUsageEvent({
      userId: context.userId,
      projectId: data.projectId,
      promptPreview: data.promptPreview,
      tokensIn: data.tokensIn,
      tokensOut: data.tokensOut,
      model: data.model,
      agent: data.agent,
      provider: data.provider,
      kind: "prompt",
    });
    return getMonthlyUsage(context.userId);
  });
