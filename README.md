# Cozy AI Studio

**cozy-ai-studio** — multi-agent visual IDE.

Warm Brutalism · chocolate accent · canvas grey `#141414`  
Plan → Code → Audit with you in the loop.

## Product

| Surface | Path | Description |
| --- | --- | --- |
| Landing | `/` | SK marketing, prompt dock → studio |
| Studio | `/studio` | Agents · Code Diff · Live Preview |
| Lab | `/playground` | Builder Kernel, Plugin SDK, Mistral stream, canvas, presence |
| Pricing | `/pricing` | Free / Pro tiers |
| Showcase | `/showcase` | Published demos |
| Mobile | `/mobile` | Companion review PWA |

### Core stack

- **TanStack Start** + Vite + React 19 + TypeScript  
- **Tailwind v4** · Warm Brutalism tokens (choco / silver / canvas)  
- **Zustand** state · Monaco Diff · multi-agent pipeline (G0 / G1 / G2)  
- **Builder Kernel** + **Plugin SDK** demos in Lab  
- Production launch wizard (checks → payment → build → live)

### Agents

1. **G0 Planner** — task graph from prompt  
2. **G1 Coder** — streaming code diffs  
3. **G2 Auditor** — OWASP / style gates + optional auto-heal  

Human-in-the-loop approval before write. Transient errors retry with backoff.

## Quick start

```bash
# Install (Node 22+)
npm install

# Dev — binds 0.0.0.0:8080
npm run dev

# Typecheck / production build
npm run typecheck
npm run build
```

After hibernate/revive the sandbox runs `startup.sh`, which starts the same dev server.

## Repo layout

```text
src/
  routes/           # landing, studio, playground, pricing, showcase, mobile
  components/studio # AgentPanel, CodeDiff, LivePreview, ProductionLaunch…
  lib/ai/           # orchestrator, retry, errors, generators
  lib/playground/   # Builder Kernel + Plugin SDK demos
  lib/production/   # launch pipeline steps
  stores/           # zustand (cozy-ai-studio-v1)
  styles.css        # design tokens
```

## Brand

| Item | Value |
| --- | --- |
| Product name | **Cozy AI Studio** |
| Package / repo slug | `cozy-ai-studio` |
| Persist key | `cozy-ai-studio-v1` |
| Accent | Chocolate `#6b3f24` / milk `#c48a5a` (dark) |
| Canvas | `#141414` |
| Theme toggle | Cream ↔ Silver gunmetal |

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server on `:8080` |
| `npm run build` | Production build (+ migrate) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run preview` | Serve built app on `:8080` |


## Production environment

Copy [`env.example`](./env.example) into Vercel → **Settings → Environment Variables** (Production).

```bash
MISTRAL_API_KEY=
DATABASE_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO=
STRIPE_PRICE_ENTERPRISE=
VERCEL_TOKEN=
VERCEL_TEAM_ID=
DEMO_PIPELINE=false
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `MISTRAL_API_KEY` | yes* | Real multi-agent pipeline (`POST /api/agents/run`) |
| `DATABASE_URL` | yes | Neon/Postgres (projects, auth, billing, RTC) |
| `BETTER_AUTH_SECRET` | yes | Session signing (`openssl rand -base64 32`) |
| `BETTER_AUTH_URL` | yes | Public origin, e.g. `https://your-app.vercel.app` |
| `STRIPE_SECRET_KEY` | yes | Checkout + portal |
| `STRIPE_WEBHOOK_SECRET` | yes | Subscription webhooks |
| `STRIPE_PRICE_PRO` / `STRIPE_PRICE_ENTERPRISE` | yes | Price IDs from Stripe Dashboard |
| `VERCEL_TOKEN` + `VERCEL_TEAM_ID` | launch | Production Launch → deploy API |
| `DEMO_PIPELINE` | no | `false` on prod; `true` forces mock agents |

\* If `DEMO_PIPELINE=true`, Mistral is optional (offline mock).

After deploy, verify (booleans only — never returns secret values):

```bash
curl -s https://YOUR_DOMAIN/api/env-status | jq
```

Optional helpers: `VERCEL_DEPLOY_HOOK_URL`, `VERCEL_PROJECT_ID`, `VITE_AUTH_ENABLED`.

## Deploy notes

- Vite config gates Nitro `vercel` preset on `command === "build"`.  
- App must listen on **`0.0.0.0:8080`** for the live preview.  
- Confirm `npm run build` + browser render of built output before shipping.

## License

Private — NEXIFY-STUDIO / Cozy AI Studio.
