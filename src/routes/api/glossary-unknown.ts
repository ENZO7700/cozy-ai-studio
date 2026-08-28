import { createFileRoute } from "@tanstack/react-router";
import {
  listUnknownGlossaryTokens,
  markGlossaryTokenStatus,
} from "@/lib/ai/glossary-learn.server";
import { knownGlossaryKeys } from "@/lib/ai/sk-brief-postprocess";

/**
 * GET  /api/glossary-unknown?days=7&limit=50
 * POST /api/glossary-unknown  { token, lang, status, proposedFix? }
 *
 * P1 learning surface — top unknown brief tokens for weekly glossary PR.
 * No auth gate (tokens only, no PII). Rate is naturally low (brief-assist only).
 */
export const Route = createFileRoute("/api/glossary-unknown")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const days = Number(url.searchParams.get("days") || "7") || 7;
        const limit = Number(url.searchParams.get("limit") || "50") || 50;
        const status = url.searchParams.get("status") || "open";
        const rows = await listUnknownGlossaryTokens({ days, limit, status });
        return Response.json({
          ok: true,
          days,
          status,
          count: rows.length,
          knownGlossarySize: knownGlossaryKeys().length,
          rows,
          weeklyHint:
            "Run: npm run glossary:weekly  → report + suggested SK_TOKEN_MAP lines",
        });
      },
      POST: async ({ request }) => {
        let body: {
          token?: string;
          lang?: string;
          status?: string;
          proposedFix?: string | null;
        } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return Response.json({ error: "BAD_JSON" }, { status: 400 });
        }
        const token = (body.token || "").trim().toLowerCase();
        const lang = (body.lang || "sk").trim();
        const status = (body.status || "").trim() as
          | "open"
          | "accepted"
          | "ignored";
        if (!token || !["open", "accepted", "ignored"].includes(status)) {
          return Response.json(
            { error: "BAD_BODY", message: "token + status required" },
            { status: 400 },
          );
        }
        const ok = await markGlossaryTokenStatus(
          token,
          lang,
          status,
          body.proposedFix,
        );
        return Response.json({ ok });
      },
    },
  },
});
