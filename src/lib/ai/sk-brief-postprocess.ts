/**
 * Lightweight Slovak-aware post-process for Studio briefs.
 *
 * Layers (fast → specific):
 * 1) fence / quote strip
 * 2) language hint (SK vs EN) — avoids CZ bleed on SK text
 * 3) whole-phrase multiword fixes
 * 4) case-preserving token glossary (domain + diacritics)
 * 5) soft length clamp
 * 6) collect unknown tokens (P1 → weekly glossary)
 *
 * Not a full spellchecker (no Hunspell/ByT5). Domain glossary covers
 * ~80% of brief typos users type on phone without diacritics.
 */

/** High-value SK domain terms users type without diacritics / with typos */
export const SK_TOKEN_MAP: Record<string, string> = {
  // cities / brands common in our demos
  kosice: "Košice",
  kosiciach: "Košiciach",
  bratislava: "Bratislava",
  // café / product
  kaviaren: "kaviareň",
  kaviarni: "kaviarni",
  kava: "káva",
  kavu: "kávu",
  kavy: "kávy",
  terakota: "terakota",
  terakotovy: "terakotový",
  terakotova: "terakotová",
  terakotove: "terakotové",
  terakotovym: "terakotovým",
  terakotovou: "terakotovou",
  kremovy: "krémový",
  kremova: "krémová",
  kremove: "krémové",
  // UI / product Slovak
  tlacidlo: "tlačidlo",
  tlacidla: "tlačidlá",
  tlacidlom: "tlačidlom",
  tlacidiel: "tlačidiel",
  nadpis: "nadpis",
  hlavicka: "hlavička",
  paticka: "pätička",
  galeria: "galéria",
  cennik: "cenník",
  objednat: "objednať",
  objednaj: "objednaj",
  kremovou: "krémovou",
  kremovej: "krémovej",
  krevovou: "krémovou",
  teplou: "teplou",
  farbou: "farbou",
  prihlasenie: "prihlásenie",
  odhlasenie: "odhlásenie",
  nastavenia: "nastavenia",
  zobrazenie: "zobrazenie",
  responzivny: "responzívny",
  responzivne: "responzívne",
  mobilny: "mobilný",
  mobilna: "mobilná",
  mobilne: "mobilné",
  // technical SK phonetics
  dizajn: "dizajn",
  styly: "štýly",
  styl: "štýl",
  farby: "farby",
  farba: "farba",
};

/** EN / product-English typos that appear even in SK briefs */
export const EN_TOKEN_MAP: Record<string, string> = {
  landig: "landing",
  landng: "landing",
  promt: "prompt",
  promts: "prompts",
  msitral: "Mistral",
  mistrall: "Mistral",
  digtal: "digital",
  digial: "digital",
  resolutin: "resolution",
  resoultion: "resolution",
  fullstack: "full-stack",
  webiste: "website",
  websit: "website",
  heder: "header",
  heaeder: "header",
  footter: "footer",
  buton: "button",
  buttom: "button",
  stilcky: "sticky",
  stickey: "sticky",
  sefl: "self",
  contianed: "contained",
  mobil: "mobile", // only as whole token; "mobil first" etc.
};

/** Common words we never log as "unknown" (not glossary candidates) */
const STOPWORDS = new Set(
  [
    // EN
    "the",
    "and",
    "for",
    "with",
    "from",
    "that",
    "this",
    "your",
    "you",
    "our",
    "are",
    "was",
    "were",
    "will",
    "can",
    "has",
    "have",
    "not",
    "but",
    "all",
    "any",
    "one",
    "two",
    "new",
    "page",
    "app",
    "web",
    "css",
    "react",
    "hero",
    "cta",
    "nav",
    "menu",
    "dark",
    "light",
    "mode",
    "first",
    "self",
    "contained",
    "warm",
    "cream",
    "sticky",
    "header",
    "footer",
    "mobile",
    "landing",
    "prompt",
    "studio",
    "brief",
    "section",
    "sections",
    "layout",
    "simple",
    "clean",
    "modern",
    "build",
    "create",
    "make",
    "add",
    "use",
    "using",
    "only",
    "into",
    "over",
    "under",
    "about",
    "after",
    "before",
    "when",
    "where",
    "which",
    "what",
    "how",
    // SK function words
    "pre",
    "pri",
    "na",
    "do",
    "od",
    "zo",
    "za",
    "po",
    "ku",
    "so",
    "aj",
    "ale",
    "ako",
    "aby",
    "nie",
    "ano",
    "áno",
    "toto",
    "toho",
    "tejto",
    "ktorý",
    "ktora",
    "ktore",
    "ktorá",
    "ktoré",
    "je",
    "su",
    "sú",
    "bol",
    "bola",
    "sme",
    "ste",
    "ma",
    "má",
    "mam",
    "mám",
    "teraz",
    "iba",
    "este",
    "ešte",
    "uz",
    "už",
    "velmi",
    "veľmi",
    "stranka",
    "stránka",
    "aplikacia",
    "aplikácia",
    // common correct SK content words (not typos)
    "moju",
    "moja",
    "moje",
    "moj",
    "môj",
    "tvoj",
    "tvoja",
    "tvoje",
    "nas",
    "náš",
    "nasa",
    "naša",
    "vase",
    "vaše",
    "vela",
    "veľa",
    "malo",
    "málo",
    "dalsi",
    "ďalší",
    "dalsia",
    "ďalšia",
    "novy",
    "nový",
    "nova",
    "nová",
    "rychly",
    "rýchly",
    "pekny",
    "pekný",
    "velky",
    "veľký",
    "maly",
    "malý",
    "miestna",
    "miestny",
    "obchod",
    "obchodu",
    "sluzby",
    "služby",
    "kontakt",
    "kontakty",
    "adresa",
    "otvaracie",
    "otváracie",
    "hodiny",
    "ponuka",
    "ponuku",
  ].map((w) => w.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()),
);

/** Word edge that works with Slovak diacritics (JS \\b is ASCII-only). */
const WB = String.raw`(?:^|(?<=[\s,;:!?("„«]))`;
const WE = String.raw`(?:$|(?=[\s,;:!?)"“»]))`;

const MULTIWORD: [RegExp, string][] = [
  [new RegExp(`${WB}kaviare\\s+n${WE}`, "gi"), "kaviareň"],
  [new RegExp(`${WB}v\\s+kosiciach${WE}`, "gi"), "v Košiciach"],
  [new RegExp(`${WB}v\\s+kosice${WE}`, "gi"), "v Košiciach"],
  [new RegExp(`${WB}self\\s+contained${WE}`, "gi"), "self-contained"],
  [new RegExp(`${WB}mobile\\s+frist${WE}`, "gi"), "mobile-first"],
  [new RegExp(`${WB}mobil\\s+first${WE}`, "gi"), "mobile-first"],
  [new RegExp(`${WB}mobil-first${WE}`, "gi"), "mobile-first"],
  [new RegExp(`${WB}sticky\\s+heder${WE}`, "gi"), "sticky header"],
  [new RegExp(`${WB}call\\s+to\\s+acton${WE}`, "gi"), "call to action"],
  [new RegExp(`${WB}full\\s+stack${WE}`, "gi"), "full-stack"],
];

/** Czech bleed → Slovak (when text is SK) */
const CZ_TO_SK: [RegExp, string][] = [
  [new RegExp(`${WB}pro\\s+modern[ií]${WE}`, "gi"), "pre modernú"],
  [new RegExp(`${WB}pro\\s+modernu${WE}`, "gi"), "pre modernú"],
  [new RegExp(`${WB}pro\\s+`, "gi"), "pre "],
  [/přichytav/gi, "priľnav"],
  [new RegExp(`${WB}nyn[ií]${WE}`, "gi"), "teraz"],
  [/tlačítk/gi, "tlačidl"],
  [/tlacitk/gi, "tlačidl"],
  [new RegExp(`${WB}objednat\\s+nyn[ií]${WE}`, "gi"), "objednať teraz"],
  [new RegExp(`${WB}kter[yýáaéé]${WE}`, "gi"), "ktorý"],
  [new RegExp(`${WB}jenom${WE}`, "gi"), "iba"],
  [new RegExp(`${WB}modern[ií]${WE}`, "gi"), "modernú"],
];

const SK_HINT =
  /[áäčďéíĺľňóôŕšťúýžÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ]|\b(pre|kaviareň|stránka|tlačidlo|hlavička|objednať|mobilný|farby|sekcie)\b/i;

function looksSlovak(text: string): boolean {
  if (SK_HINT.test(text)) return true;
  return /\b(kaviaren|kosice|tlacidlo|objednat|hlavicka|galeria|cennik|nastavenia)\b/i.test(
    text,
  );
}

function applyCase(sample: string, replacement: string): string {
  if (!sample) return replacement;
  if (sample === sample.toUpperCase() && sample.length > 1) {
    return replacement.toUpperCase();
  }
  if (sample[0] === sample[0]?.toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function stripKey(core: string): string {
  return core
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function mapToken(
  raw: string,
  dict: Record<string, string>,
): { out: string; core: string | null; hit: boolean } {
  const m = raw.match(/^([("'„«]*)(.*?)([)\]"'“».,;:!?…]*)$/);
  if (!m) return { out: raw, core: null, hit: true };
  const [, pre, core, post] = m;
  if (!core || core.length < 2) return { out: raw, core: null, hit: true };
  if (/^https?:\/\//i.test(core) || core.includes("/") || core.startsWith("@")) {
    return { out: raw, core: null, hit: true };
  }
  if (/^[A-Z0-9]{2,}[-_][A-Z0-9-]+$/.test(core)) {
    return { out: raw, core: null, hit: true };
  }
  const key = stripKey(core);
  const hitVal = dict[core.toLowerCase()] ?? dict[key] ?? null;
  if (!hitVal) return { out: raw, core, hit: false };
  return {
    out: `${pre}${applyCase(core, hitVal)}${post}`,
    core,
    hit: true,
  };
}

/** Candidate for glossary: unknown, not stopword, looks like content word */
export function isGlossaryCandidate(token: string): boolean {
  const key = stripKey(token);
  if (key.length < 3 || key.length > 32) return false;
  if (!/^[a-z]+(?:-[a-z]+)*$/i.test(key)) return false;
  if (STOPWORDS.has(key)) return false;
  if (SK_TOKEN_MAP[key] || EN_TOKEN_MAP[key]) return false;
  // Already has diacritics → almost certainly correct SK, not a learn target
  if (
    /[áäčďéíĺľňóôŕšťúýžÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ]/.test(token) ||
    /\p{M}/u.test(token.normalize("NFD"))
  ) {
    return false;
  }
  return true;
}

export function knownGlossaryKeys(): string[] {
  return [
    ...Object.keys(SK_TOKEN_MAP),
    ...Object.keys(EN_TOKEN_MAP),
  ].sort();
}

export type SkPostprocessResult = {
  text: string;
  lang: "sk" | "en" | "mixed";
  fixes: number;
  /** Unique unknown content tokens (for P1 glossary learning) */
  unknownTokens: string[];
};

export function postprocessStudioBrief(input: string): SkPostprocessResult {
  let t = input.trim();
  if (!t) return { text: t, lang: "en", fixes: 0, unknownTokens: [] };
  const before = t;

  t = t.replace(/^```[\w]*\n?|\n?```$/g, "").trim();
  t = t.replace(/^["'“”„«]+|["'“”»]+$/g, "").trim();
  t = t
    .replace(
      /^(here(?:'s| is)|improved brief|brief|vylepšený brief)\s*:\s*/i,
      "",
    )
    .trim();

  for (const [re, to] of MULTIWORD) t = t.replace(re, to);

  const sk = looksSlovak(t);
  if (sk) {
    for (const [re, to] of CZ_TO_SK) t = t.replace(re, to);
  }

  const dict = { ...EN_TOKEN_MAP, ...(sk ? SK_TOKEN_MAP : {}) };
  const unknown = new Set<string>();
  t = t
    .split(/(\s+)/)
    .map((part) => {
      if (/^\s+$/.test(part)) return part;
      const { out, core, hit } = mapToken(part, dict);
      if (!hit && core && isGlossaryCandidate(core)) {
        unknown.add(stripKey(core));
      }
      return out;
    })
    .join("");

  if (t.length > 600) {
    const cut = t.slice(0, 597);
    const sp = cut.lastIndexOf(" ");
    t = (sp > 400 ? cut.slice(0, sp) : cut).trimEnd() + "…";
  }

  const fixes =
    before === t
      ? 0
      : Math.max(
          1,
          Math.abs(before.length - t.length) +
            (before.toLowerCase() === t.toLowerCase() ? 0 : 1),
        );

  return {
    text: t,
    lang: sk ? "sk" : "en",
    fixes,
    unknownTokens: [...unknown],
  };
}

/** Back-compat helper used by brief-assist */
export function cleanBrief(text: string): string {
  return postprocessStudioBrief(text).text;
}

/**
 * Scan raw user brief for unknown tokens before Mistral rewrite.
 * Most valuable for learning real typos.
 */
export function collectUnknownFromRaw(
  text: string,
  langHint?: "sk" | "en" | "mixed",
): { lang: "sk" | "en" | "mixed"; tokens: string[] } {
  const pp = postprocessStudioBrief(text || "");
  const lang = langHint && langHint !== "mixed" ? langHint : pp.lang;
  return { lang, tokens: pp.unknownTokens };
}
