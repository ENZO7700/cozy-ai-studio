/**
 * Minimal BriefForge / metabox → SectionPatch mapper (P10 light).
 * Maps wordpress.main (+ optional seo) into CCT hero update fields.
 */
import type { SectionPatch } from "./types";
import { validatePatches } from "./patch";

export type BriefForgeMetaboxLike = {
  wordpress?: {
    main?: {
      title?: string;
      tagline?: string;
      context?: string;
      label?: string;
      link?: string;
    };
  };
  seo?: {
    title?: string;
    description?: string;
  };
};

export function briefForgeToSectionPatches(
  payload: BriefForgeMetaboxLike,
  opts?: { heroId?: number; seoId?: number; pageId?: number },
): SectionPatch[] {
  const heroId = opts?.heroId ?? 5;
  const seoId = opts?.seoId ?? 8;
  const pageId = opts?.pageId ?? 4;
  const main = payload.wordpress?.main ?? {};
  const patches: SectionPatch[] = [];

  const heroFields: Record<string, string> = {};
  if (main.title) heroFields.nadpis = main.title;
  if (main.tagline || main.context) {
    heroFields.text = [main.tagline, main.context].filter(Boolean).join(" — ");
  }
  if (main.label) heroFields.cta_name = main.label;
  if (main.link) heroFields.cta_link = main.link;

  if (Object.keys(heroFields).length) {
    patches.push({
      op: "update",
      collection: "sections",
      id: heroId,
      pageId,
      type: "hero",
      fields: heroFields,
    });
  }

  const seoFields: Record<string, string> = {};
  if (payload.seo?.title) seoFields.meta_title = payload.seo.title;
  if (payload.seo?.description) seoFields.meta_description = payload.seo.description;
  if (Object.keys(seoFields).length) {
    patches.push({
      op: "update",
      collection: "seo",
      id: seoId,
      pageId,
      fields: seoFields,
    });
  }

  const errors = validatePatches(patches);
  if (errors.length) return [];
  return patches;
}
