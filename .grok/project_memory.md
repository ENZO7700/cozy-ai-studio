- Remix funnel: /a/:id has terracotta "Remix in Studio" CTA (mobile above-fold + desktop); applyShareRemix hydrates without auto-pipeline, tracks remix_opened {source:ui} [2026-07-31]
- Commits: 77ed7eb (CTA), 979c5ba (applyShareRemix harden), 118bbec (prod-smoke remix asserts), e471eb9 (hide prod error demos), 40999f46 (CLEAN_EDITOR.md) [2026-07-31]
- Clean Editor: Brief-panel 2-step confirm wipe of chat/files/diff/share; store method cleanEditor(); issue #26; UI+store code still pending full push [2026-07-31]
- Target CMS for COSY connector: WordPress + Crocoblock JetEngine CCT (not classic WP CPT/Gutenberg). Business data in CCT pages/sections/seo; WP is presentation shell only. Frontend via Query Builder. gruppa.json = query map (api_endpoint all false). SoT = jet-cct REST; Supabase optional mirror only [2026-07-31]
- JetEngine data model: pages (order_id, menu) → sections (order_id, post_id, type hero|block + content fields) → seo (post_id). Prefer pageId in COSY Section Graph for future non-WP port; type as enum [2026-07-31]
- Still needed before code: CCT field export or sample GET /wp-json/jet-cct/sections item (gruppa.json has empty custom_content_types/meta_boxes) [2026-07-31]

