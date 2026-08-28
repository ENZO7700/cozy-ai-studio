/**
 * Client-safe server functions for public shares.
 * Handlers dynamically import server-only modules so `vite` / `pg` never
 * enter the client graph (fixes createRequire crash on /studio).
 */
import { createServerFn } from "@tanstack/react-start";

export type SharedPreviewLoaderData =
  | {
      notFound: false;
      id: string;
      title: string;
      html: string;
      promptPreview: string | null;
      createdAt: string;
      hasSource: boolean;
    }
  | {
      notFound: true;
      id: string;
      error?: true;
    };

export const loadSharedPreviewFn = createServerFn({ method: "GET" })
  .validator((id: unknown) => String(id ?? "").trim())
  .handler(async ({ data: id }): Promise<SharedPreviewLoaderData> => {
    if (!id) return { notFound: true, id: "" };
    try {
      const { getSharedPreview } = await import("./server");
      const { recordActivationEvent } = await import("@/lib/activation/server");
      const row = await getSharedPreview(id);
      if (!row) return { notFound: true, id };
      void recordActivationEvent({
        event: "share_viewed",
        meta: { id: row.id },
      });
      return {
        notFound: false,
        id: row.id,
        title: row.title,
        html: row.html,
        promptPreview: row.prompt_preview,
        createdAt: row.created_at,
        hasSource: Boolean(row.source_code?.trim()),
      };
    } catch {
      return { notFound: true, id, error: true };
    }
  });
