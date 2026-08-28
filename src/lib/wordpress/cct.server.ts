import { getWpCctEnv } from "./env";
import type { CctCollection, CctInventory, CctItem, CctWriteResult, SectionPatch } from "./types";
import { validatePatches } from "./patch";

const TIMEOUT_MS = 15_000;

function authHeader(username: string, appPassword: string): string {
  const token = Buffer.from(`${username}:${appPassword}`, "utf8").toString("base64");
  return `Basic ${token}`;
}

async function wpFetch(
  path: string,
  init?: RequestInit & { auth?: boolean },
): Promise<Response> {
  const env = getWpCctEnv();
  const url = `${env.baseUrl}${path}`;
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  if (init?.auth !== false && env.appPassword && env.appPassword !== "local-cct-mirror") {
    headers.set("Authorization", authHeader(env.username, env.appPassword));
  }
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, headers, signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

const MIRROR: CctInventory = {
  ok: true,
  mode: "mirror",
  baseUrl: "http://localhost:4422",
  pages: [
    { id: 4, title: "Domov", order_id: 1, menu: "true", status: "publish" },
  ],
  sections: [
    {
      id: 5,
      title: "Hero Domov",
      type: "hero",
      post_id: 4,
      order_id: 1,
      nadpis: "Cubaxx",
      text: "Mirror inventory — set WP_APP_PASSWORD for live writes.",
      cta_name: "Chcem demo",
      cta_link: "http://localhost:4422/",
      status: "publish",
    },
    {
      id: 6,
      title: "Block BusinessWeb",
      type: "block",
      post_id: 4,
      order_id: 3,
      nadpis: "BusinessWeb",
      text: "Sekcie namiesto page builder chaosu.",
      status: "publish",
    },
    {
      id: 7,
      title: "Block Framework",
      type: "block",
      post_id: 4,
      order_id: 2,
      nadpis: "WordPress framework",
      text: "Free cosy-cct namiesto JetEngine.",
      status: "publish",
    },
  ],
  seo: [
    {
      id: 8,
      post_id: 4,
      meta_title: "Cubaxx — COSY Local",
      meta_description: "Mirror SEO",
      robots: "index,follow",
      status: "publish",
    },
  ],
};

export async function testWpConnection(): Promise<{
  ok: boolean;
  mode: "live" | "mirror";
  message: string;
  user?: unknown;
}> {
  const env = getWpCctEnv();
  if (env.mirror) {
    return {
      ok: true,
      mode: "mirror",
      message: "Mirror mode (local-cct-mirror / no app password) — inventory stub only",
    };
  }
  try {
    const res = await wpFetch("/wp-json/wp/v2/users/me", { auth: true });
    if (!res.ok) {
      return { ok: false, mode: "live", message: `users/me HTTP ${res.status}` };
    }
    const user = await res.json();
    return { ok: true, mode: "live", message: "Connected", user };
  } catch (e) {
    return {
      ok: false,
      mode: "live",
      message: e instanceof Error ? e.message : "connection failed",
    };
  }
}

async function fetchCollection(collection: CctCollection): Promise<CctItem[]> {
  const env = getWpCctEnv();
  let res = await wpFetch(`/wp-json/cosy-cct/v1/${collection}`, { auth: false });
  if (res.status === 404) {
    res = await wpFetch(`/wp-json/jet-cct/${collection}`, { auth: false });
  }
  if (!res.ok) {
    throw new Error(`${collection} HTTP ${res.status}`);
  }
  const data = (await res.json()) as CctItem[];
  return Array.isArray(data) ? data : [];
}

export async function getCctInventory(): Promise<CctInventory> {
  const env = getWpCctEnv();
  if (env.mirror) {
    return { ...MIRROR, baseUrl: env.baseUrl };
  }
  const [pages, sections, seo] = await Promise.all([
    fetchCollection("pages"),
    fetchCollection("sections"),
    fetchCollection("seo"),
  ]);
  return {
    ok: true,
    mode: "live",
    baseUrl: env.baseUrl,
    pages,
    sections,
    seo,
  };
}

export async function applySectionPatches(
  patches: SectionPatch[],
  accept: boolean,
): Promise<CctWriteResult> {
  if (!accept) {
    return {
      ok: false,
      results: [
        {
          collection: "sections",
          ok: false,
          status: 403,
          error: "accept:true required (HitL)",
        },
      ],
    };
  }
  const errors = validatePatches(patches);
  if (errors.length) {
    return {
      ok: false,
      results: errors.map((error) => ({
        collection: "sections" as const,
        ok: false,
        status: 400,
        error,
      })),
    };
  }
  const env = getWpCctEnv();
  if (env.mirror) {
    return {
      ok: false,
      results: [
        {
          collection: "sections",
          ok: false,
          status: 503,
          error: "Mirror mode — set WP_APP_PASSWORD for live writes",
        },
      ],
    };
  }

  const results: CctWriteResult["results"] = [];
  for (const patch of patches) {
    if (patch.op !== "update" || !patch.id) {
      results.push({
        collection: patch.collection,
        ok: false,
        status: 400,
        error: "only update with id supported in MVP",
      });
      continue;
    }
    try {
      let res = await wpFetch(`/wp-json/cosy-cct/v1/${patch.collection}/${patch.id}`, {
        method: "POST",
        auth: true,
        body: JSON.stringify(patch.fields),
      });
      if (res.status === 404) {
        res = await wpFetch(`/wp-json/jet-cct/${patch.collection}/${patch.id}`, {
          method: "POST",
          auth: true,
          body: JSON.stringify(patch.fields),
        });
      }
      const item = res.ok ? ((await res.json()) as CctItem) : undefined;
      results.push({
        collection: patch.collection,
        id: patch.id,
        status: res.status,
        ok: res.ok,
        item,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      });
    } catch (e) {
      results.push({
        collection: patch.collection,
        id: patch.id,
        status: 500,
        ok: false,
        error: e instanceof Error ? e.message : "write failed",
      });
    }
  }
  return { ok: results.every((r) => r.ok), results };
}
