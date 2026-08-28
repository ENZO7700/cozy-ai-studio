/** WordPress CCT types — pages → sections → seo */

export type CctCollection = "pages" | "sections" | "seo";

export type CctSectionType =
  | "hero"
  | "block"
  | "faq"
  | "cta"
  | "gallery"
  | "pricing"
  | "contact";

export const SECTION_FIELD_WHITELIST = [
  "order_id",
  "post_id",
  "type",
  "nadpis",
  "text",
  "cta_name",
  "cta_link",
  "image_id",
] as const;

export const PAGE_FIELD_WHITELIST = ["order_id", "menu"] as const;

export const SEO_FIELD_WHITELIST = [
  "post_id",
  "meta_title",
  "meta_description",
  "robots",
] as const;

export type SectionFieldKey = (typeof SECTION_FIELD_WHITELIST)[number];

export type CctItem = {
  _ID?: number;
  id: number;
  title?: string;
  status?: string;
  order_id?: number | null;
  post_id?: number | null;
  type?: string | null;
  nadpis?: string | null;
  text?: string | null;
  cta_name?: string | null;
  cta_link?: string | null;
  image_id?: number | null;
  menu?: string | null;
  meta_title?: string | null;
  meta_description?: string | null;
  robots?: string | null;
};

export type SectionPatch = {
  op: "update" | "create";
  collection: CctCollection;
  id?: number;
  pageId?: number;
  type?: CctSectionType | string;
  fields: Record<string, string | number | null>;
};

export type CctInventory = {
  ok: true;
  mode: "live" | "mirror";
  baseUrl: string;
  pages: CctItem[];
  sections: CctItem[];
  seo: CctItem[];
};

export type CctWriteResult = {
  ok: boolean;
  results: Array<{
    collection: CctCollection;
    id?: number;
    status: number;
    ok: boolean;
    error?: string;
    item?: CctItem;
  }>;
};
