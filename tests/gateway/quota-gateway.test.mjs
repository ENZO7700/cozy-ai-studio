/**
 * Unit tests — quota gateway pure + charge mapping
 * Run: npm run test:gateway
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  FREE_PRODUCT_CAPS,
  toSnapshot,
  quotaHeaders,
  quotaBodyFields,
  buildDeniedResult,
  buildUsageEventPayload,
} from "../../src/lib/gateway/quota-pure.ts";

const freeOk = (over = {}) => ({
  ok: true,
  planTier: "FREE",
  promptsUsed: 3,
  promptLimit: 100,
  dailyUsed: 5,
  dailyLimit: 20,
  superAdmin: false,
  ...over,
});

const freeDailyBlocked = {
  ok: false,
  planTier: "FREE",
  promptsUsed: 12,
  promptLimit: 100,
  dailyUsed: 20,
  dailyLimit: 20,
  superAdmin: false,
  code: "DAILY_LIMIT",
  message: "Daily free limit reached (20/20).",
};

const freeMonthlyBlocked = {
  ok: false,
  planTier: "FREE",
  promptsUsed: 100,
  promptLimit: 100,
  dailyUsed: 2,
  dailyLimit: 20,
  superAdmin: false,
  code: "MONTHLY_LIMIT",
  message: "Monthly prompt limit reached (100/100).",
};

const superAdminOk = {
  ok: true,
  planTier: "ENTERPRISE",
  promptsUsed: 50,
  promptLimit: 10_000_000,
  dailyUsed: 9,
  dailyLimit: null,
  superAdmin: true,
};

describe("toSnapshot / FREE_PRODUCT_CAPS", () => {
  it("A1 free ok gets product caps 20/100", () => {
    const s = toSnapshot(freeOk());
    assert.deepEqual(s.freeProductCaps, { daily: 20, monthly: 100 });
    assert.equal(FREE_PRODUCT_CAPS.daily, 20);
    assert.equal(FREE_PRODUCT_CAPS.monthly, 100);
  });

  it("A2 superAdmin still freeProductCaps 20/100", () => {
    const s = toSnapshot(superAdminOk);
    assert.deepEqual(s.freeProductCaps, { daily: 20, monthly: 100 });
    assert.equal(s.promptLimit, 10_000_000);
  });

  it("A3 blocked daily keeps free caps", () => {
    const s = toSnapshot(freeDailyBlocked);
    assert.equal(s.ok, false);
    assert.deepEqual(s.freeProductCaps, { daily: 20, monthly: 100 });
  });
});

describe("quotaHeaders", () => {
  it("B1 used=3 limit=100 → remaining 97", () => {
    const h = quotaHeaders(toSnapshot(freeOk()));
    assert.equal(h["X-CAI-Quota-Used"], "3");
    assert.equal(h["X-CAI-Quota-Limit"], "100");
    assert.equal(h["X-CAI-Quota-Remaining"], "97");
  });

  it("B2 used=limit → remaining 0", () => {
    const h = quotaHeaders(toSnapshot(freeOk({ promptsUsed: 100 })));
    assert.equal(h["X-CAI-Quota-Remaining"], "0");
  });

  it("B3 used > limit clamps remaining to 0", () => {
    const h = quotaHeaders(toSnapshot(freeOk({ promptsUsed: 150 })));
    assert.equal(h["X-CAI-Quota-Remaining"], "0");
  });

  it("B4 daily remaining 15", () => {
    const h = quotaHeaders(toSnapshot(freeOk()));
    assert.equal(h["X-CAI-Daily-Used"], "5");
    assert.equal(h["X-CAI-Daily-Limit"], "20");
    assert.equal(h["X-CAI-Daily-Remaining"], "15");
  });

  it("B5 super dailyLimit null → none", () => {
    const h = quotaHeaders(toSnapshot(superAdminOk));
    assert.equal(h["X-CAI-Daily-Limit"], "none");
    assert.equal(h["X-CAI-Daily-Remaining"], "none");
  });

  it("B6 super-admin flag 0/1", () => {
    assert.equal(quotaHeaders(toSnapshot(freeOk()))["X-CAI-Super-Admin"], "0");
    assert.equal(
      quotaHeaders(toSnapshot(superAdminOk))["X-CAI-Super-Admin"],
      "1",
    );
  });

  it("B7 free product headers always 20/100", () => {
    for (const q of [freeOk(), superAdminOk, freeDailyBlocked]) {
      const h = quotaHeaders(toSnapshot(q));
      assert.equal(h["X-CAI-Free-Product-Daily"], "20");
      assert.equal(h["X-CAI-Free-Product-Monthly"], "100");
    }
  });

  it("B8 all header values are strings", () => {
    const h = quotaHeaders(toSnapshot(freeOk()));
    for (const [k, v] of Object.entries(h)) {
      assert.equal(typeof v, "string", k);
    }
  });
});

describe("quotaBodyFields", () => {
  it("C1 free ok remaining numbers", () => {
    const b = quotaBodyFields(toSnapshot(freeOk()));
    assert.equal(b.quotaRemaining, 97);
    assert.equal(b.dailyRemaining, 15);
  });

  it("C2 super dailyRemaining null (JSON)", () => {
    const b = quotaBodyFields(toSnapshot(superAdminOk));
    assert.equal(b.dailyRemaining, null);
  });

  it("C3 freeProductCaps always 20/100 on enterprise", () => {
    const b = quotaBodyFields(toSnapshot(superAdminOk));
    assert.deepEqual(b.freeProductCaps, { daily: 20, monthly: 100 });
  });

  it("C4 superAdmin coerced boolean", () => {
    const b = quotaBodyFields(toSnapshot(freeOk({ superAdmin: undefined })));
    assert.equal(b.superAdmin, false);
  });
});

describe("buildDeniedResult (429 path, no charge)", () => {
  it("E2 DAILY_LIMIT status 429 + body/headers", () => {
    const r = buildDeniedResult(toSnapshot(freeDailyBlocked));
    assert.equal(r.ok, false);
    assert.equal(r.status, 429);
    assert.equal(r.body.error, "DAILY_LIMIT");
    assert.equal(r.headers["X-CAI-Daily-Remaining"], "0");
    assert.equal(r.headers["X-CAI-Quota-Remaining"], "88");
  });

  it("E3 MONTHLY_LIMIT quotaRemaining 0", () => {
    const r = buildDeniedResult(toSnapshot(freeMonthlyBlocked));
    assert.equal(r.body.error, "MONTHLY_LIMIT");
    assert.equal(r.body.quotaRemaining, 0);
    assert.equal(r.headers["X-CAI-Quota-Remaining"], "0");
  });
});

describe("buildUsageEventPayload (charge mapping)", () => {
  it("F1 kind prompt + agent G0_G1_G2", () => {
    const p = buildUsageEventPayload({
      userId: "u1",
      projectId: "p1",
      prompt: "hello",
      provider: "mistral",
      model: "x",
    });
    assert.equal(p.kind, "prompt");
    assert.equal(p.agent, "G0_G1_G2");
    assert.equal(p.userId, "u1");
    assert.equal(p.projectId, "p1");
    assert.equal(p.provider, "mistral");
    assert.equal(p.model, "x");
  });

  it("F2 tokensIn = ceil(len/4)", () => {
    assert.equal(
      buildUsageEventPayload({ userId: "u", prompt: "abcd" }).tokensIn,
      1,
    );
    assert.equal(
      buildUsageEventPayload({ userId: "u", prompt: "abcde" }).tokensIn,
      2,
    );
    assert.equal(
      buildUsageEventPayload({ userId: "u", prompt: "" }).tokensIn,
      0,
    );
  });

  it("F3 tokensOut always 0", () => {
    assert.equal(
      buildUsageEventPayload({ userId: "u", prompt: "x" }).tokensOut,
      0,
    );
  });

  it("F4 projectId null ok", () => {
    const p = buildUsageEventPayload({
      userId: "u",
      projectId: null,
      prompt: "x",
    });
    assert.equal(p.projectId, null);
  });
});

describe("anti-coupling", () => {
  it("H1 pure module source has no studio-store import", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      new URL("../../src/lib/gateway/quota-pure.ts", import.meta.url),
      "utf8",
    );
    assert.equal(src.includes("studio-store"), false);
    assert.equal(src.includes("@/stores"), false);
  });

  it("H2 server gateway source has no studio-store import", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      new URL("../../src/lib/gateway/quota-gateway.server.ts", import.meta.url),
      "utf8",
    );
    assert.equal(/from\s+["']@\/stores/.test(src), false);
    assert.equal(/from\s+["'].*studio-store/.test(src), false);
  });
});
