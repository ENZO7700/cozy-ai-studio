/**
 * P1: persist unknown brief tokens for weekly glossary expansion.
 * Server-only — never throws into the request path.
 */

import { getSql } from "@/lib/db";

export type UnknownTokenHit = {
  token: string;
  lang: "sk" | "en" | "mixed";
  context?: string;
  source?: string;
};

function normalizeToken(t: string): string | null {
  const key = t
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (key.length < 3 || key.length > 40) return null;
  if (!/^[a-z0-9][a-z0-9_-]*[a-z0-9]$|^[a-z]{3,}$/i.test(key)) return null;
  if (/^\d+$/.test(key)) return null;
  return key;
}

/** Upsert unknown tokens (best-effort). */
export async function logUnknownGlossaryTokens(
  hits: UnknownTokenHit[],
): Promise<{ logged: number }> {
  if (!hits.length) return { logged: 0 };

  const merged = new Map<
    string,
    { token: string; lang: string; context?: string; source: string }
  >();
  for (const h of hits) {
    const token = normalizeToken(h.token);
    if (!token) continue;
    const lang = h.lang === "en" ? "en" : "sk";
    const k = `${lang}::${token}`;
    if (!merged.has(k)) {
      merged.set(k, {
        token,
        lang,
        context: h.context?.slice(0, 160),
        source: h.source || "brief",
      });
    }
  }
  if (!merged.size) return { logged: 0 };

  try {
    const sql = await getSql();
    let n = 0;
    for (const row of merged.values()) {
      await sql`
        insert into glossary_unknown_tokens (
          token, lang, hit_count, first_seen, last_seen,
          sample_context, source, status
        ) values (
          ${row.token},
          ${row.lang},
          1,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP,
          ${row.context ?? null},
          ${row.source},
          'open'
        )
        on conflict (token, lang) do update set
          hit_count = glossary_unknown_tokens.hit_count + 1,
          last_seen = CURRENT_TIMESTAMP,
          sample_context = coalesce(
            excluded.sample_context,
            glossary_unknown_tokens.sample_context
          )
      `;
      n += 1;
    }
    return { logged: n };
  } catch (e) {
    // Table missing / no DB — still emit structured log for Vercel
    console.info(
      "[glossary-learn]",
      JSON.stringify({
        event: "unknown_tokens",
        count: merged.size,
        tokens: [...merged.values()].map((v) => v.token).slice(0, 40),
        err: e instanceof Error ? e.message : String(e),
      }),
    );
    return { logged: 0 };
  }
}

export type GlossaryUnknownRow = {
  token: string;
  lang: string;
  hit_count: number;
  first_seen: string;
  last_seen: string;
  sample_context: string | null;
  source: string;
  status: string;
  proposed_fix: string | null;
};

export async function listUnknownGlossaryTokens(opts?: {
  days?: number;
  limit?: number;
  status?: string;
}): Promise<GlossaryUnknownRow[]> {
  const days = opts?.days ?? 7;
  const limit = Math.min(opts?.limit ?? 100, 500);
  const status = opts?.status ?? "open";
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  try {
    const sql = await getSql();
    const rows = await sql<GlossaryUnknownRow>`
      select token, lang, hit_count,
             first_seen::text, last_seen::text,
             sample_context, source, status, proposed_fix
      from glossary_unknown_tokens
      where status = ${status}
        and last_seen >= ${since}
      order by hit_count desc, last_seen desc
      limit ${limit}
    `;
    return rows;
  } catch {
    return [];
  }
}

export async function markGlossaryTokenStatus(
  token: string,
  lang: string,
  status: "open" | "accepted" | "ignored",
  proposedFix?: string | null,
): Promise<boolean> {
  try {
    const sql = await getSql();
    await sql`
      update glossary_unknown_tokens
      set status = ${status},
          proposed_fix = ${proposedFix ?? null}
      where token = ${token.toLowerCase()} and lang = ${lang}
    `;
    return true;
  } catch {
    return false;
  }
}
