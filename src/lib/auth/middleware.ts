import { createMiddleware } from "@tanstack/react-start";

/**
 * Auth middleware — works for path A (Supabase JWT) and B (Better Auth bearer/cookie).
 */
export const authMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { resolveAuthProvider } = await import("./mode");
    const provider = resolveAuthProvider("client");
    let bearerToken: string | undefined;
    if (provider === "supabase") {
      const { getSupabaseAccessToken } = await import("./supabase-browser");
      bearerToken = (await getSupabaseAccessToken()) ?? undefined;
    } else {
      const { getBearerToken } = await import("./client");
      bearerToken = getBearerToken() ?? undefined;
    }
    return next({ sendContext: { bearerToken } });
  })
  .server(async ({ next, context }) => {
    const { assertSameSiteRequest } = await import("./isolation.server");
    const { requireUserId } = await import("./verify.server");
    assertSameSiteRequest();
    const userId = await requireUserId(context.bearerToken);
    return next({ context: { userId } });
  });
