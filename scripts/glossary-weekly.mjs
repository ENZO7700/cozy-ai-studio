#!/usr/bin/env node
/**
 * P1 weekly glossary review
 *
 * Usage:
 *   npm run glossary:weekly
 *   DAYS=14 LIMIT=80 PROD_URL=https://canvas.h4ck3d.me npm run glossary:weekly
 *
 * - Fetches top unknown tokens from /api/glossary-unknown (or local if BASE=local)
 * - Writes report under screenshots/glossary-weekly-YYYY-MM-DD.{json,md}
 * - Prints suggested SK_TOKEN_MAP / EN_TOKEN_MAP lines to paste after manual review
 *
 * Does NOT auto-merge into the glossary (human review required).
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const DAYS = Number(process.env.DAYS || "7") || 7;
const LIMIT = Number(process.env.LIMIT || "80") || 80;
const BASE = (
  process.env.PROD_URL ||
  process.env.BASE_URL ||
  "https://canvas.h4ck3d.me"
).replace(/\/$/, "");

const outDir = join(process.cwd(), "screenshots");
mkdirSync(outDir, { recursive: true });
const day = new Date().toISOString().slice(0, 10);

function guessFix(token) {
  // Heuristic suggestions only — human must confirm
  const t = token.toLowerCase();
  const guesses = {
    kaviaren: "kaviareň",
    tlacidlo: "tlačidlo",
    hlavicka: "hlavička",
    paticka: "pätička",
    galeria: "galéria",
    cennik: "cenník",
    objednat: "objednať",
    responzivny: "responzívny",
    mobilny: "mobilný",
    landig: "landing",
    promt: "prompt",
    heder: "header",
    digtal: "digital",
    fullstack: "full-stack",
  };
  if (guesses[t]) return guesses[t];
  // bare diacritic restore for common endings
  if (t.endsWith("ny") && !t.endsWith("ný")) return t.slice(0, -2) + "ný";
  if (t.endsWith("na") && t.includes("mobil")) return t.slice(0, -2) + "ná";
  return null;
}

function isLikelySk(token) {
  return /[áäčďéíĺľňóôŕšťúýž]/.test(token) ||
    /^(pre|kaviar|tlac|hlav|objed|galer|cenn|mobil|respon|terak|krem)/i.test(
      token,
    );
}

async function main() {
  const url = `${BASE}/api/glossary-unknown?days=${DAYS}&limit=${LIMIT}&status=open`;
  console.log(`[glossary:weekly] GET ${url}`);
  let data;
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${await res.text().catch(() => "")}`);
    }
    data = await res.json();
  } catch (e) {
    console.error("[glossary:weekly] fetch failed:", e.message || e);
    console.error(
      "Ensure production is deployed with migration 0010 + /api/glossary-unknown",
    );
    process.exit(1);
  }

  const rows = Array.isArray(data.rows) ? data.rows : [];
  const suggestions = rows.map((r) => {
    const proposed = r.proposed_fix || guessFix(r.token);
    const map = isLikelySk(r.token) || r.lang === "sk" ? "SK" : "EN";
    return {
      token: r.token,
      lang: r.lang,
      hit_count: r.hit_count,
      sample_context: r.sample_context,
      map,
      suggestedLine: proposed
        ? `  ${r.token}: "${proposed}",`
        : `  // ${r.token}: "??? — manual",`,
      proposed,
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    days: DAYS,
    knownGlossarySize: data.knownGlossarySize ?? null,
    openCount: rows.length,
    top: suggestions.slice(0, 30),
    all: suggestions,
  };

  const jsonPath = join(outDir, `glossary-weekly-${day}.json`);
  const mdPath = join(outDir, `glossary-weekly-${day}.md`);
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const md = [
    `# Glossary weekly — ${day}`,
    ``,
    `- Source: \`${BASE}\``,
    `- Window: last **${DAYS}** days`,
    `- Open unknowns: **${rows.length}**`,
    `- Known glossary size: **${data.knownGlossarySize ?? "?"}**`,
    ``,
    `## Top candidates (paste after review into sk-brief-postprocess.ts)`,
    ``,
    "```ts",
    `// --- weekly ${day} ---`,
    ...suggestions
      .filter((s) => s.hit_count >= 1)
      .slice(0, 40)
      .map(
        (s) =>
          `${s.suggestedLine} // hits=${s.hit_count} lang=${s.lang} map=${s.map}`,
      ),
    "```",
    ``,
    `## Raw table`,
    ``,
    `| hits | lang | token | proposed | context |`,
    `| ---: | --- | --- | --- | --- |`,
    ...suggestions.slice(0, 50).map((s) => {
      const ctx = (s.sample_context || "").replace(/\|/g, "/").slice(0, 60);
      return `| ${s.hit_count} | ${s.lang} | \`${s.token}\` | ${s.proposed || "—"} | ${ctx} |`;
    }),
    ``,
    `## Workflow`,
    ``,
    `1. Review proposed fixes (never auto-accept Czech bleed).`,
    `2. Add accepted lines to \`SK_TOKEN_MAP\` / \`EN_TOKEN_MAP\`.`,
    `3. Mark accepted:`,
    `   \`curl -X POST ${BASE}/api/glossary-unknown -H 'content-type: application/json' -d '{"token":"…","lang":"sk","status":"accepted","proposedFix":"…"}'\``,
    `4. Ignore noise: \`"status":"ignored"\`.`,
    ``,
  ].join("\n");

  writeFileSync(mdPath, md);

  console.log(`[glossary:weekly] wrote ${jsonPath}`);
  console.log(`[glossary:weekly] wrote ${mdPath}`);
  console.log(`[glossary:weekly] top 10:`);
  for (const s of suggestions.slice(0, 10)) {
    console.log(
      `  ${String(s.hit_count).padStart(4)}  ${s.lang}  ${s.token}  →  ${s.proposed || "?"}`,
    );
  }
  if (!rows.length) {
    console.log(
      "[glossary:weekly] empty — send a few typo briefs via Improve to seed learning.",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
