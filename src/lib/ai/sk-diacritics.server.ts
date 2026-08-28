/**
 * P2: cheap Slovak diacritics-only pass (no rewrite).
 * Uses small model + low temperature. Server-only.
 */

import { getMistralApiKey, mistralChat, MistralHttpError } from "./mistral.server";
import { postprocessStudioBrief } from "./sk-brief-postprocess";

const DIACRITICS_SYSTEM = `You restore Slovak diacritics ONLY.

Rules:
- Output ONLY the corrected text (no quotes, no markdown, no preamble).
- Add missing diacritics: aáä, cč, dď, eé, ií, lĺľ, nň, oóô, rŕ, sš, tť, uú, yý, zž where correct in Slovak.
- Do NOT rewrite, reorder, summarize, translate, or add/remove words.
- Do NOT switch to Czech.
- Keep punctuation, numbers, Latin brand codes, English product terms, URLs unchanged.
- Preserve approximate length and word count (±1 word max).
- If already correct, return the text unchanged.`;

function skeleton(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function looksLikeNeedsDiacritics(text: string): boolean {
  if (
    /\b(kaviaren|kosice|tlacidlo|tlacidlom|objednat|hlavicka|galeria|cennik|stranka|aplikacia|mobilny|responzivny|terakotovy|kremovy|kremovou|krevovou)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  // SK text without any diacritics
  if (
    !/[áäčďéíĺľňóôŕšťúýžÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ]/.test(text) &&
    /\b(pre|moju|kavu|ponuka|stranka|farba|tlacidlo)\b/i.test(text)
  ) {
    return true;
  }
  return false;
}

function acceptDiacriticsResult(input: string, output: string): boolean {
  const a = input.trim();
  const b = output.trim();
  if (!b || b.length < 2) return false;
  if (b.length > a.length * 1.25 + 10) return false;
  if (b.length < a.length * 0.7 - 6) return false;
  // word count must stay almost identical (no rewrite)
  const wa = wordCount(a);
  const wb = wordCount(b);
  if (Math.abs(wa - wb) > 1) return false;

  const sa = skeleton(a).replace(/[^\p{L}\p{N}]+/gu, "");
  const sb = skeleton(b).replace(/[^\p{L}\p{N}]+/gu, "");
  if (sa === sb) return true;
  if (sa.length > 6 && sb.length > 6) {
    let same = 0;
    const n = Math.min(sa.length, sb.length);
    for (let i = 0; i < n; i++) if (sa[i] === sb[i]) same++;
    if (same / Math.max(sa.length, sb.length) >= 0.9) return true;
  }
  return false;
}

export type DiacriticsResult = {
  text: string;
  provider: "mistral" | "glossary" | "noop";
  changed: boolean;
  model?: string;
};

/**
 * Restore Slovak diacritics without semantic rewrite.
 * Prefer cheap Mistral small on original text; glossary as polish/fallback.
 */
export async function restoreSlovakDiacritics(opts: {
  text: string;
  signal?: AbortSignal;
  /** force Mistral even if text looks fine */
  forceModel?: boolean;
}): Promise<DiacriticsResult> {
  const input = (opts.text || "").trim();
  if (!input) {
    return { text: "", provider: "noop", changed: false };
  }

  const lang = postprocessStudioBrief(input).lang;
  const needs =
    opts.forceModel ||
    (lang === "sk" && looksLikeNeedsDiacritics(input)) ||
    (lang === "sk" &&
      !/[áäčďéíĺľňóôŕšťúýž]/i.test(input) &&
      /[a-z]{4,}/i.test(input));

  // EN or nothing to do → glossary polish only
  if (!needs || lang === "en") {
    const local = postprocessStudioBrief(input);
    return {
      text: local.text,
      provider: local.fixes > 0 ? "glossary" : "noop",
      changed: local.text !== input,
    };
  }

  const model =
    process.env.MISTRAL_MODEL_DIACRITICS ??
    process.env.MISTRAL_MODEL_PLAN ??
    "mistral-small-latest";

  if (getMistralApiKey()) {
    try {
      const raw = await mistralChat({
        signal: opts.signal,
        model,
        temperature: 0.05,
        maxTokens: Math.min(600, Math.max(80, Math.ceil(input.length * 1.5))),
        messages: [
          { role: "system", content: DIACRITICS_SYSTEM },
          {
            role: "user",
            content: `Restore Slovak diacritics only (same words):\n\n${input}`,
          },
        ],
      });
      let out = raw.trim();
      out = out.replace(/^```[\w]*\n?|\n?```$/g, "").trim();
      out = out.replace(/^["'“”]+|["'“”]+$/g, "").trim();
      // strip accidental "Here is" prefixes
      out = out.replace(/^(here(?:'s| is)|opraven[yý] text)\s*:\s*/i, "").trim();

      if (acceptDiacriticsResult(input, out)) {
        const polished = postprocessStudioBrief(out);
        return {
          text: polished.text,
          provider: "mistral",
          changed: polished.text !== input,
          model,
        };
      }
    } catch (e) {
      if (e instanceof MistralHttpError && e.status === 429) throw e;
      // fall through to glossary
    }
  }

  // Fallback: local glossary only
  const local = postprocessStudioBrief(input);
  return {
    text: local.text,
    provider: local.fixes > 0 ? "glossary" : "noop",
    changed: local.text !== input,
    model,
  };
}
