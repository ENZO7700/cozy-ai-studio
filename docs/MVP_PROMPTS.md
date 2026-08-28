# Cozy AI Studio — 5 MVP promptov (ukáž / predávaj)

Cieľ MVP: **demo + predajný flow**  
Login → Studio → Mistral agent → Preflight → Accept → Live Preview → (voliteľne Pricing).

Nemeniť: landing, CAI, PWA, 3-column chrome, device frames.

---

## MVP-1 · Persist + DB

```
Persist Studio server-side (ne localStorage only).
- Migrácie 0001–0004 už existujú; over PGLite local + DATABASE_URL na prod.
- ensureUserRow pre Supabase UUID aj Better Auth id.
- loadMyWorkspace / saveMyProjectFiles / useProjectSync debounced 800ms.
- Po Accept HitL: save files server-side.
- Ak chýba DATABASE_URL na Vercel: mvp-status jasne missing; local PGLite OK.
AC: signed-in user refresh → files stále tam (s DB). Bez DB → graceful fail + toast, nie crash.
```

## MVP-2 · Auth e2e (Supabase Path A)

```
Supabase Auth gate na /studio.
- AUTH_PROVIDER=supabase, VITE_SUPABASE_* + SUPABASE_* .
- /login OAuth Google/GitHub ak provider zapnutý; email magic ak treba.
- /auth/callback → redirect /studio.
- authMiddleware JWT → userId na createServerFn.
- Bez usera: Navigate /login?redirect=/studio.
AC: neprihlásený nevidí Studio shell; po logine hydrate workspace.
```

## MVP-3 · Mistral production AI

```
DEMO_PIPELINE=false + MISTRAL_API_KEY.
- POST /api/agents/run SSE phase|token|file|task|error|done.
- G0/G1/G2; Preflight; HitL; usage recordMyPromptUsage.
- FREE limit z store/server.
AC: /api/ai-status ok:true; Studio chat BEZ "offline demo pipeline".
```

## MVP-4 · Live Preview Runtime

```
WebContainer top-level; srcDoc fallback v embed.
- COOP/COEP; Accept → writeFilesAndReload multi-file.
- Badge "Live runtime" / "Rýchly náhľad"; Retry.
AC: top-level prod badge Live runtime; Grok embed = rýchly náhľad OK.
```

## MVP-5 · Pricing CTA (Stripe ready)

```
Pricing: FREE activate; PRO/ENTERPRISE → Stripe Checkout ak keys.
- Žiadny fake "demo mode" success na platených plánoch.
- Ak Stripe missing: toast s missing env, nie falošná platba.
- Webhook route pripravená; planTier zo servera keď DB+Stripe.
AC: FREE funguje; PRO bez keys = jasná chyba; s keys = redirect Checkout.
```

---

## Poradie implementácie
1 → 2 → 3 → 4 → 5  
Potom `GET /api/mvp-status` → `mvpReady: true`.

## Manuálne (ty, nie prompt)
| Env | Kde |
|---|---|
| MISTRAL_API_KEY | Vercel (už) |
| DATABASE_URL | Supabase pooler |
| SUPABASE_SERVICE_ROLE_KEY | Supabase API |
| STRIPE_* | Stripe Dashboard |
| Auth redirect | Supabase → cozy-ai-studio.vercel.app/auth/callback |
