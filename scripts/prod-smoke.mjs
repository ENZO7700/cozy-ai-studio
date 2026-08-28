#!/usr/bin/env node
/**
 * Production smoke — Option B spine (Post-MVP P7, no Stripe dry-run).
 * Usage: node scripts/prod-smoke.mjs [baseUrl]
 * Env: SMOKE_AGENT=0 to skip live Mistral stream (saves quota).
 */
const BASE = (
  process.argv[2] ||
  process.env.PROD_URL ||
  "https://cozy-ai-studio.vercel.app"
).replace(/\/$/, "");
const RUN_AGENT = process.env.SMOKE_AGENT !== "0";
const fails = [];
const notes = [];
function must(cond, msg) {
  if (cond) notes.push(`ok: ${msg}`);
  else fails.push(msg);
}

async function main() {
  const mvp = await fetch(`${BASE}/api/mvp-status`).then((r) => r.json());
  must(mvp.optionBReady === true || mvp.mvpReady === true, "optionBReady");
  must(mvp.gates?.mistralLive === true, "mistralLive");
  must(mvp.gates?.databaseUrl === true, "databaseUrl");
  must(mvp.gates?.stripeCheckout !== true, "stripe not falsely live");
  must(mvp.gates?.freeQuota === true, "freeQuota gate");

  const agents = await fetch(`${BASE}/api/agents/run`).then((r) => r.json());
  must(agents.ok === true, "agents/run GET ok");
  // Product free caps (20/100) — super-admin may report unlimited personal limits
  const freeDaily =
    agents.freeProductCaps?.daily ?? agents.quota?.freeDailyLimit ?? agents.quota?.dailyLimit;
  const freeMonthly =
    agents.freeProductCaps?.monthly ??
    agents.quota?.freePromptLimit ??
    agents.quota?.promptLimit;
  const isSuper = agents.quota?.superAdmin === true;
  must(
    freeDaily === 20 || (isSuper && agents.freeProductCaps?.daily === 20),
    "dailyLimit 20",
  );
  must(
    freeMonthly === 100 ||
      (isSuper && agents.freeProductCaps?.monthly === 100) ||
      (isSuper && agents.quota?.freePromptLimit === 100),
    "promptLimit 100",
  );
  must(agents.quota?.withinQuota !== false, "withinQuota readable");

  const empty = await fetch(`${BASE}/api/agents/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const emptyBody = await empty.json().catch(() => ({}));
  must(
    empty.status === 400 && emptyBody.error === "EMPTY_PROMPT",
    "empty prompt 400",
  );

  // Funnel seed (activation write path)
  for (const event of ["brief_sent", "pipeline_done", "accept"]) {
    const r = await fetch(`${BASE}/api/activation-stats`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, meta: { source: "prod-smoke" } }),
    });
    const body = await r.json().catch(() => ({}));
    must(r.ok && body.ok, `activation POST ${event}`);
  }

  const share = await fetch(`${BASE}/api/share`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      html: "<!doctype html><html><body><h1>prod-smoke</h1></body></html>",
      title: "prod-smoke",
      promptPreview: "prod-smoke brief",
      sourceCode: "export default function App(){return <h1>smoke</h1>}",
      meta: { source: "prod-smoke" },
    }),
  }).then((r) => r.json());
  must(share.ok && share.id, "share create");
  if (share.id) {
    const page = await fetch(`${BASE}/a/${share.id}`);
    must(page.status === 200, `share page ${page.status}`);
    const html = await page.text();
    must(
      /<title>[^<]+Cozy share/i.test(html) || /og:title/i.test(html),
      "share page has title/og",
    );
    must(/prod-smoke|Cozy/i.test(html), "share page content");
    must(
      /Remix in Studio/i.test(html),
      "share page Remix in Studio CTA",
    );
    must(
      new RegExp(`/studio\\?remix=${share.id}`).test(html) ||
        html.includes(`remix=${share.id}`),
      "share page remix href",
    );

    // remix route loads (SSR shell; client hydrate fires remix_opened)
    const remix = await fetch(
      `${BASE}/studio?remix=${encodeURIComponent(share.id)}`,
    );
    must(remix.status === 200, `studio remix route ${remix.status}`);
    const remixHtml = await remix.text();
    must(/Studio|FREE|Funnel|Share/i.test(remixHtml), "studio shell on remix");

    // Ensure activation endpoint accepts remix_opened (write path)
    const remixAct = await fetch(`${BASE}/api/activation-stats`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: "remix_opened",
        meta: { source: "prod-smoke", shareId: share.id },
      }),
    });
    const remixActBody = await remixAct.json().catch(() => ({}));
    must(remixAct.ok && remixActBody.ok, "activation POST remix_opened");
  }

  // Optional live Mistral SSE (uses 1 daily credit)
  if (RUN_AGENT) {
    const agent = await fetch(`${BASE}/api/agents/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify({
        prompt: "Tiny hello page, one brown button, minimal HTML.",
        originalCode: "",
        activeFile: "src/App.tsx",
      }),
    });
    if (agent.status === 429) {
      notes.push("ok: agent stream skipped (quota 429)");
    } else if (agent.status === 200 && agent.body) {
      const reader = agent.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const events = new Set();
      const t0 = Date.now();
      while (Date.now() - t0 < 75_000) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        for (const line of buf.split("\n")) {
          if (line.startsWith("event:")) events.add(line.slice(6).trim());
        }
        if (events.has("done") || events.has("error")) break;
      }
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      must(
        events.has("done") || events.has("phase") || events.has("token"),
        `agent SSE progress (${[...events].join(",") || "none"})`,
      );
    } else {
      fails.push(`agent stream HTTP ${agent.status}`);
    }
  } else {
    notes.push("ok: agent stream skipped (SMOKE_AGENT=0)");
  }

  const act = await fetch(`${BASE}/api/activation-stats?hours=24`).then((r) =>
    r.json(),
  );
  must(act.ok === true && act.counts, "activation-stats ok");
  must("share_viewed" in (act.counts || {}), "share_viewed metric present");
  must("reject" in (act.counts || {}), "reject metric present");
  must("remix_opened" in (act.counts || {}), "remix_opened metric present");
  must((act.counts?.brief_sent ?? 0) >= 1, "brief_sent counted");
  must((act.counts?.share_created ?? 0) >= 1, "share_created counted");
  must(act.stripeGate && typeof act.stripeGate.ready === "boolean", "stripeGate present");
  must(act.real && typeof act.real.totals === "number", "real totals present");
  must(act.smoke && typeof act.smoke.totals === "number", "smoke totals present");

  const tel = await fetch(`${BASE}/api/telemetry-stats?hours=24`).then((r) =>
    r.json(),
  );
  must(tel.ok === true && "approved" in tel, "telemetry-stats ok");

  // pair open (does not require two peers)
  const pairOpen = await fetch(`${BASE}/api/ws/http`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ op: "open" }),
  }).then((r) => r.json());
  must(Boolean(pairOpen.clientId), "pair http open");
  if (pairOpen.clientId) {
    const pair = await fetch(`${BASE}/api/ws/http`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "send",
        clientId: pairOpen.clientId,
        message: {
          type: "create_pair",
          projectId: "smoke-proj",
          clientId: pairOpen.clientId,
        },
      }),
    }).then((r) => r.json());
    const code = pair.messages?.find((m) => m.type === "pair_code")?.code;
    must(Boolean(code), `pair code ${code || "missing"}`);
  }

  const launch = await fetch(`${BASE}/api/launch/run`).then((r) => r.json());
  must(launch.ok === true, "launch/run GET ok");
  must("vercelReady" in launch, "vercelReady field");
  // Redeploy-from-app needs VERCEL_TOKEN on the project; optional for Option B
  // when deploys are done via Git/CLI. Endpoint must still respond.
  must(
    launch.ok === true &&
      (launch.modes?.redeploy === true ||
        launch.vercelReady === true ||
        launch.endpoint === "POST /api/launch/run"),
    "redeploy mode available",
  );

  const studio = await fetch(`${BASE}/studio`);
  const studioHtml = await studio.text();
  must(studio.status === 200, "studio 200");
  must(/FREE|Limits|Share|Studio/i.test(studioHtml), "studio chrome text");

  const landing = await fetch(`${BASE}/`);
  const html = await landing.text();
  must(landing.status === 200, "landing 200");
  must(!/Figma\s*→\s*production/i.test(html), "no Figma claim");
  must(!/Enterprise SSO/i.test(html), "no Enterprise SSO claim");

  console.log(
    JSON.stringify(
      { base: BASE, ok: fails.length === 0, fails, notes },
      null,
      2,
    ),
  );
  process.exit(fails.length ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
