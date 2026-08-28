#!/usr/bin/env node
/**
 * WP CCT contract against running Studio (:8090) + local WP (:4422).
 * Usage: node scripts/wp-cct-contract.mjs [studioBase]
 */
const STUDIO = process.argv[2] || process.env.STUDIO_BASE || "http://127.0.0.1:8090";
const WP = process.env.WP_BASE_URL || "http://localhost:4422";

let fail = 0;
function ok(name) {
  console.log(`PASS  ${name}`);
}
function bad(name, detail) {
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  fail++;
}

async function json(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { res, body };
}

async function main() {
  console.log(`==> wp-cct-contract studio=${STUDIO} wp=${WP}`);

  // WP health
  try {
    const r = await fetch(WP + "/wp-json/cosy-cct/v1/sections/5");
    if (r.ok) ok("WP cosy-cct sections/5");
    else bad("WP cosy-cct sections/5", `HTTP ${r.status}`);
  } catch (e) {
    bad("WP reachable", String(e));
  }

  // Studio env
  {
    const { res, body } = await json(`${STUDIO}/api/wp/cct?action=env`);
    if (res.ok && body.baseUrl) ok(`studio env baseUrl=${body.baseUrl} mirror=${body.mirror}`);
    else bad("studio env", `HTTP ${res.status}`);
  }

  // Inventory
  {
    const { res, body } = await json(`${STUDIO}/api/wp/cct`);
    if (res.ok && Array.isArray(body.sections) && body.sections.length >= 1) {
      ok(`inventory sections=${body.sections.length} mode=${body.mode}`);
    } else bad("inventory", `HTTP ${res.status}`);
  }

  // Reject without accept
  {
    const { res, body } = await json(`${STUDIO}/api/wp/cct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accept: false,
        patches: [{ op: "update", collection: "sections", id: 5, fields: { nadpis: "Nope" } }],
      }),
    });
    if (res.status === 403 && body.error === "ACCEPT_REQUIRED") ok("reject without accept:true");
    else bad("reject without accept", `HTTP ${res.status} ${JSON.stringify(body)}`);
  }

  // Reject URL nadpis
  {
    const { res, body } = await json(`${STUDIO}/api/wp/cct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accept: true,
        patches: [
          {
            op: "update",
            collection: "sections",
            id: 5,
            fields: { nadpis: "https://evil.example/share" },
          },
        ],
      }),
    });
    if (!body.ok && res.status === 400) ok("reject URL nadpis");
    else bad("reject URL nadpis", `HTTP ${res.status} ${JSON.stringify(body)}`);
  }

  // Accept valid patch + verify WP
  const token = `CCT-${Date.now().toString(36)}`;
  {
    const { res, body } = await json(`${STUDIO}/api/wp/cct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accept: true,
        patches: [
          {
            op: "update",
            collection: "sections",
            id: 5,
            type: "hero",
            fields: { nadpis: token },
          },
        ],
      }),
    });
    if (res.ok && body.ok) ok(`accept write nadpis=${token}`);
    else bad("accept write", `HTTP ${res.status} ${JSON.stringify(body)}`);

    const wr = await fetch(`${WP}/wp-json/cosy-cct/v1/sections/5`);
    const item = await wr.json();
    if (item.nadpis === token) ok("WP GET matches accept write");
    else bad("WP GET after accept", `got ${item.nadpis}`);

    // restore Cubaxx
    await json(`${STUDIO}/api/wp/cct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accept: true,
        patches: [
          {
            op: "update",
            collection: "sections",
            id: 5,
            fields: { nadpis: "Cubaxx" },
          },
        ],
      }),
    });
  }

  if (fail) {
    console.log("WP CCT CONTRACT FAILED");
    process.exit(1);
  }
  console.log("WP CCT CONTRACT PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
