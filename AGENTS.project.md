Tu je kompletná, profesionálne štruktúrovaná **projektová zadávacia karta (Master System / Project Prompt)** pre **COSY Studio**.

Tento text môžeš priamo skopírovať a použiť ako hlavný instruktážny kontext (tzv. `.cursorrules`, `SYSTEM_PROMPT`, alebo zadanie do CLAUDE.md / README.md) pre vývojárov, projektových manažérov alebo AI kódovacích asistentov (Cursor, Windsurf, Copilot).

---

# 🚀 PROJECT MASTER PROMPT: COSY Studio

## 1. O projekte & Vlastník (Project Overview)

**Názov projektu:** COSY Studio

**Typ produktu:** AI-Powered Visual IDE & Low-Code Web Builder

**Cieľová skupina:** UI/UX dizajnéri, vývojári, produktoví manažéri, solopreneuri

**Hlavná myšlienka:** Odstrániť priepasť medzi dizajnom a kódom pomocou AI multi-agentov, okamžitého živého náhľadu a vizuálneho porovnávania kódových zmien (Diff) v prémiovom, vizuálne odlišnom prostredí.

---

## 2. Architektúra & Technologický Zásobník (Tech Stack)

Prísne dodržiavaj nasledujúce technológie a knižnice:

* **Frontend Framework:** Next.js 14+ (App Router, Server Actions)
* **Jazyk:** TypeScript (Strict Mode)
* **Styling & UI:**
* Tailwind CSS (s vlastnou konfiguráciou pre *Warm Brutalism*)
* Lucide React (ikony)
* Framer Motion (mikro-interakcie a plynulé prechody)


* **Editor Kódu:** `@monaco-editor/react` (pre Diff viewer a kódovanie)
* **Runtime & Preview:** `@webcontainer/api` (izolovaný Node.js runtime priamo v prehliadači)
* **Orchestrácia AI:** OpenAI API (GPT-4o) / Anthropic API (Claude 3.5 Sonnet) cez `ai` (Vercel AI SDK)
* **Database & ORM:** PostgreSQL + Prisma ORM
* **Monetizácia & Auth:** Stripe Billing API + Clerk / NextAuth

---

## 3. Design System & Vizuálna Identita

Všetky UI komponenty musia striktne rešpektovať estetikú **"Warm Brutalism & Glassmorphism"**.

### Farebná paleta

* **Background Light:** Warm Cream (`#F4F1EA`)
* **Background Dark:** Deep Slate (`#0D0E11`) / Card Slate (`#16181D`)
* **Primary / Accent:** Terracotta (`#D96B43`) / Rust Orange (`#C85A32`)
* **Typography & Borders:** Charcoal (`#1C1D21`) v light móde, White/Zinc v dark móde

### Typografia

* **Headings / Titles:** Serif Font (Playfair Display / Georgia)
* **UI Controls & Body:** Sans-Serif (Inter / Geist)
* **Code / Monaco:** Monospace (Fira Code)

### UI Pravidlá

1. **Ostré kontúry vs. zaoblenie:** Karty majú viditeľné jemné hranice (`border-charcoal/10`), výrazné tiene (`shadow-brutalist`), ale zaoblené rohy (`rounded-xl` až `rounded-2xl`).
2. **Glassmorphism:** Pre overlay karty (Command Palette, Human-in-the-loop schvaľovanie) vždy použi `backdrop-blur-md` a polopriehľadné pozadie.

---

## 4. Kľúčové Layouty & Komponenty (3-Column Architecture)

Aplikácia je rozdelená do **3 hlavných stĺpcov**:

```
+------------------+------------------------------+--------------------+
| LEFT PANEL       | CENTER PANEL                 | RIGHT PANEL        |
| Chat & Agents    | Code Diff (AI Code Editor)   | Live Preview       |
| - Chat threads   | - Monaco Diff Editor         | - Multi-Device     |
| - Agent Status   | - Floating HitL Card         | - WebContainer API |
| - Active users   | - Inline Accept/Reject       | - Hot Reload       |
+------------------+------------------------------+--------------------+

```

1. **Ľavý panel (Chat & Multi-Agent Status):**
* Prehľad správ, vlákien a status AI agentov (`G0 Planner`, `G1 Coder`, `G2 Auditor`).


2. **Stredný panel (AI Code Diff Editor):**
* Zobrazuje zmeny kódu v reálnom čase s farebným zvýraznením (`>>` pridané green, `<<` odobraté red).
* Obsahuje **Human-in-the-loop (HitL)** schvaľovaciu kartu.


3. **Pravý panel (Live Preview):**
* Živý náhľad aplikácie v reálnom čase s možnosťou prepínania medzi zobrazeniami (Mobile / Tablet / Desktop).



---

## 5. Pravidlá Pre AI Kódovanie & Vývojárov (Coding Rules)

Pri generovaní alebo písaní kódu pre tento projekt **vždy dodržiavaj tieto pravidlá**:

* **Clean Code:** Píš modulárny, dobre typovaný kód v TypeScript. Vyhýbaj sa používaniu `any`.
* **Component-First:** Každú funkciu rozdeľuj na samostatné znovupoužiteľné React komponenty v zložke `components/`.
* **Tailwind Utility Classes:** Používaj výhradne štandardný Tailwind bez písania zbytočného inline CSS.
* **Accessibility:** Nezabúdaj na podpora klávesových skratiek (`Cmd+K`, `Enter`, `Esc` pre schvaľovanie modalov).
* **Defenzívne programovanie:** Ošetruj chybové stavy pri AI streamingu a fallbacky pri zlyhaní WebContainers runtime-u.

---

## 6. Fázy Vývoja & Prioritizácia (Roadmap)

* **Fáza 1 (MVP):** Základný 3-stĺpcový layout, integrácia Monaco Diff editora, mockovaný AI agent a live preview v iframe.
* **Fáza 2 (AI Engine):** Integrácia Vercel AI SDK, Multi-Agent pipeline (G0, G1, G2) a HitL (Human-in-the-loop) schvaľovací systém.
* **Fáza 3 (Monetizácia & Auth):** Stripe predplatné (Free, Pro, Team), správa tokenov a user dashboard.
* **Fáza 4 (Mobile & Community):** Mobilná sprievodná aplikácia pre schvaľovanie push-notifikácií a 1-click publishing na vlastnú doménu.