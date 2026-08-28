# REPAIR BACKLOG — Cozy AI Studio (Option B)

**Source:** forensic product audit · Option B Speed Studio / Brief→Demo  
**Last updated:** 2026-07-31  
**Prod:** https://cozy-ai-studio.vercel.app

---

## FAZA 0 — Audit (summary)

| | |
|--|--|
| Verdict | **B** (Speed Studio) |
| Truth / Money / Not-demo / Risk | **3 / 0 / 4 / 70–80%** (pre-repair) |
| Live prod | `https://cozy-ai-studio.vercel.app` · Mistral OK when key set |
| Dead | legacy lovable host → N/A |

**Lies (cut):** Enterprise/Figma claim, CRDT product, Pro mock without Stripe, Kernel-as-editor, fake test counts.  
**Real:** `/api/agents/run`, chat UI, Canvas/preview, share `/a/:id`, templates.  
**Holes (pre-repair):** no daily AI cap, no Stripe, RLS apply UNVERIFIED.

---

## FAZA 1 — Direction

| | A Insurance | **B Speed Studio ✓** | C SK/CZ local landing |
|--|-------------|----------------------|------------------------|
| ICP | Freelancer/agency | Founder/marketer non-dev | SMB SK/CZ |
| Value 10 min | Gate-pass + ZIP | **Brief → preview → share link** | SK template → mobile site |
| $ | Repair passes | Credits after cap | One-shot €29–49 |
| Primary | `/chat` + gate | **`/` → `/studio`** | `/templates` |

**Why B:** shipped spine = chat→artifact→share; Vercel live; monetization 0 allows truth+cap first; Kernel/CRDT/Plugin out of scope.

---

## FAZA 2 — Cut matrix (B)

**KEEP:** chat API, chat UI, Canvas/preview, share, templates, soft gates, CSP/ship tests.  
**CUT:** Figma/Enterprise copy, Pro tiers as live, default builder, Kernel/Plugin/CRDT product, marketplace, insurance CTA.  
**BUILD S1:** daily spend cap, `SOURCE_OF_TRUTH.md`, empty-state templates, share prominence.  
**BUILD S2+:** Stripe only if activation holds — else no Pro UI.

---

## FAZA 3 — Wow (B)

1. **≤10s:** Hero truth + CTA → `/studio` (open demo; auth optional)
2. **≤60s:** template one-tap → stream → preview + Share
3. **≤5 min:** public `/a/:id` in clipboard
4. **Kill:** builder-as-default, Figma claim, Pro mock, dual brand, playground in primary nav
5. **Trust:** “N left today” (after cap), not fake Insurance
6. **Mobile:** composer + preview + share; **Monaco desktop-only**

---

## FAZA 4 — Priority status

| ID | What | Status |
|----|------|--------|
| **P0.1–0.4** | Truth cut · next=/studio · SoT | **Done** |
| **P1.1–1.3** | Daily AI cap + UI remaining + env | **Done** |
| **P2.1–2.3** | Templates · Share CTA · ship-gate | **Done** |
| **P3** | Freeze Kernel/CRDT/Plugin product | **Done** |
| **P4** | Stripe after activation | **Skipped** (hold) |
| **Share public** | `/a/:id` + Accept+Share | **Done** |
| **Cloud persist** | open-demo hydrate/save | **Done** |
| **Remix** | `/studio?remix=` | **Done** |
| **Monaco mobile** | desktop-only Diff | **This pass** |
| **RLS** | app-layer user scoping + doc | **This pass** |
| **Free publish A** | og tags + public link CTAs | **This pass** |
| **Activation B** | funnel events + /api/activation-stats | **Done** |
| **Telemetry P4** | HitL → DB + /api/telemetry-stats + reject event | **This pass** |
| **P6 security** | indexes + SoT (no force RLS) | **Done** |
| **P7 smoke** | full spine prod-smoke | **Done** |
| **Mobile WS** | companion pair PG | **Done** |
| **Real deploy launch** | Vercel redeploy mode (Prompt C) | **Done** |

---

## Freeze (still)

marketplace, CRDT host, Plugin write product UI, Kernel-on-chat, Figma product, Artifact Insurance pricing, Stripe UI as live without keys.

---

## Related

- [SOURCE_OF_TRUTH.md](./SOURCE_OF_TRUTH.md)
- [todo.md](../todo.md)
- [MVP_PROMPTS.md](./MVP_PROMPTS.md)
