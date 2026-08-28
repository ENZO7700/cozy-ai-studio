import {
  PAGE_FIELD_WHITELIST,
  SECTION_FIELD_WHITELIST,
  SEO_FIELD_WHITELIST,
  type CctCollection,
  type SectionPatch,
} from "./types";

const URLISH = /^(https?:\/\/|www\.)/i;
const SHARE_HOST = /(grok-sandbox\.com|localhost:80(?:80|90)\/[ap]\/)/i;

/** Reject share/URL pollution in copy fields. */
export function isForbiddenCopyValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v) return false;
  if (URLISH.test(v)) return true;
  if (SHARE_HOST.test(v)) return true;
  return false;
}

export function validatePatches(patches: SectionPatch[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(patches) || patches.length === 0) {
    errors.push("patches[] required");
    return errors;
  }
  for (let i = 0; i < patches.length; i++) {
    const p = patches[i];
    const prefix = `patches[${i}]`;
    if (!p || typeof p !== "object") {
      errors.push(`${prefix}: invalid`);
      continue;
    }
    if (!["pages", "sections", "seo"].includes(p.collection)) {
      errors.push(`${prefix}: bad collection`);
    }
    if (p.op === "update" && (!p.id || p.id < 1)) {
      errors.push(`${prefix}: id required for update`);
    }
    const fields = p.fields ?? {};
    for (const [key, val] of Object.entries(fields)) {
      if (!isFieldAllowed(p.collection, key)) {
        errors.push(`${prefix}: field '${key}' not in whitelist`);
        continue;
      }
      if (
        (key === "nadpis" || key === "text" || key === "meta_title") &&
        isForbiddenCopyValue(val)
      ) {
        errors.push(`${prefix}: '${key}' must not be a URL/share link`);
      }
    }
  }
  return errors;
}

function isFieldAllowed(collection: CctCollection, key: string): boolean {
  if (collection === "sections") {
    return (SECTION_FIELD_WHITELIST as readonly string[]).includes(key);
  }
  if (collection === "pages") {
    return (PAGE_FIELD_WHITELIST as readonly string[]).includes(key);
  }
  return (SEO_FIELD_WHITELIST as readonly string[]).includes(key);
}

/** Parse simple SK brief lines into patches targeting known live IDs. */
export function briefToSectionPatches(
  brief: string,
  opts?: { heroId?: number; pageId?: number },
): SectionPatch[] {
  const heroId = opts?.heroId ?? 5;
  const pageId = opts?.pageId ?? 4;
  const fields: Record<string, string> = {};
  const lines = brief.split(/\n|;/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(
      /^(?:hero\s*)?(?:nadpis|headline)\s*[:=]\s*["']?(.+?)["']?$/i,
    );
    if (m) fields.nadpis = m[1].trim();
    const t = line.match(/^(?:hero\s*)?text\s*[:=]\s*["']?(.+?)["']?$/i);
    if (t) fields.text = t[1].trim();
    const c = line.match(/^(?:cta|cta_name)\s*[:=]\s*["']?(.+?)["']?$/i);
    if (c) fields.cta_name = c[1].trim();
  }
  if (Object.keys(fields).length === 0) return [];
  const errors = validatePatches([
    { op: "update", collection: "sections", id: heroId, pageId, type: "hero", fields },
  ]);
  if (errors.length) return [];
  return [
    {
      op: "update",
      collection: "sections",
      id: heroId,
      pageId,
      type: "hero",
      fields,
    },
  ];
}
