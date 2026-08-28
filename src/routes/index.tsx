import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  Brain,
  Check,
  Code2,
  Command,
  Eye,
  Play,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CozyLogo } from "@/components/brand/CozyLogo";

export const Route = createFileRoute("/")({
  component: LandingPage,
  head: () => ({
    meta: [
      {
        title: "Cozy AI Studio — Brief → preview → share",
      },
      {
        name: "description",
        content:
          "Rýchle AI studio: brief → diff → live preview → schválenie → public share link. Free daily limit. Žiadny fake Enterprise checkout.",
      },
    ],
  }),
});

const FEATURES = [
  {
    icon: Brain,
    title: "Viditeľný agent pipeline",
    body: "G0 plánuje, G1 streamuje kód, G2 audituje. Každý krok vidíš v paneli — nie čierna skrinka.",
    span: "sm:col-span-2",
  },
  {
    icon: Code2,
    title: "Diff, ktorý chápeš",
    body: "Farebné pridania a odobratia. Schváľ alebo zamietni bloky pred zápisom do projektu.",
    span: "",
  },
  {
    icon: Eye,
    title: "Live preview",
    body: "Mobil, tablet aj desktop frame. Vidíš výsledok skôr, než niečo uložíš.",
    span: "",
  },
  {
    icon: ShieldCheck,
    title: "Ty rozhoduješ",
    body: "Karty Human-in-the-loop pred schválením. Server drží denný free limit pred modelom.",
    span: "",
  },
  {
    icon: Smartphone,
    title: "Mobile pair",
    body: "Spáruj telefón a schvaľuj diff na ceste (mobilný companion).",
    span: "",
  },
  {
    icon: Sparkles,
    title: "Brief → Studio",
    body: "Jedna veta na landingu otvorí studio s predvyplneným promptom. Žiadna inštalácia.",
    span: "sm:col-span-2",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Opíš zámer",
    body: "Napríklad „landing pre kaviareň s cenníkom“. Stačí jedna veta.",
  },
  {
    n: "02",
    title: "Sleduj pipeline",
    body: "G0 → G1 → G2 v paneli. Diff + live preview vedľa seba.",
  },
  {
    n: "03",
    title: "Schváľ zmeny",
    body: "Accept/reject. Free: denný + mesačný limit (server 429).",
  },
];

const PROMPTS = [
  "Landing pre remeselnú kávu v Košiciach",
  "Dashboard s metrikami a dark mode",
  "Pricing stránka s tromi balíkmi",
];

function LandingPage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [focused, setFocused] = useState(false);

  const launch = (value?: string) => {
    const q = (value ?? prompt).trim();
    if (q) {
      try {
        sessionStorage.setItem("cozy-landing-prompt", q);
      } catch {
        /* ignore */
      }
    }
    void navigate({ to: "/studio" });
  };

  return (
    <div className="min-h-dvh bg-background text-foreground overflow-x-hidden cosy-page">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
      >
        <div className="absolute inset-0 bg-background" />
        <div className="absolute -top-32 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-choco/[0.07] blur-3xl" />
        <div className="absolute top-[40%] right-[-10%] h-[360px] w-[360px] rounded-full bg-choco-soft/40 blur-3xl dark:bg-choco/10" />
      </div>

      <header className="cosy-sticky-top border-b border-border/70 bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5 group">
            <CozyLogo size="md" variant="seal" className="group-hover:-translate-y-px transition-transform" />
            <div className="leading-none">
              <span className="font-serif text-lg font-bold tracking-tight">
                Cozy AI Studio
              </span>
              <span className="hidden sm:block text-[11px] text-muted-foreground mt-0.5">
                Brief → preview → approve
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm">
            {[
              { href: "#funkcie", label: "Funkcie" },
              { href: "#ako", label: "Ako to funguje" },
              { to: "/connect" as const, label: "WP CCT" },
              { to: "/pricing" as const, label: "Limity" },
              { to: "/showcase" as const, label: "Galéria" },
            ].map((item) =>
              "href" in item ? (
                <a
                  key={item.label}
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.label}
                  to={item.to}
                  className="rounded-lg px-3 py-2 text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>

          <div className="flex items-center gap-2">
            <Link to="/studio">
              <Button size="sm" className="h-9 gap-1.5">
                Otvoriť studio
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-14 sm:pt-20 pb-10 sm:pb-14">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 flex flex-col items-center gap-4">
              <CozyLogo size="xl" variant="stack" className="mb-1" />
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-success agent-pulse" />
                Speed Studio · HitL · denný free cap
              </div>
            </div>

            <h1 className="font-serif text-[2.35rem] sm:text-6xl lg:text-[4rem] font-bold leading-[1.08] tracking-tight mb-5 text-balance">
              Od vety k náhľadu{" "}
              <span className="text-choco">— s tebou v slučke</span>
            </h1>

            <p className="text-base sm:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto mb-8 text-pretty">
              Napíš brief, sleduj agentov a diff, schváľ zmeny a zdieľaj verejný odkaz (/a/…).
              Bez inštalácie. Free má reálny denný limit (server vráti 429 pred volaním modelu).
            </p>

            <div
              className={cn(
                "mx-auto max-w-2xl rounded-2xl border bg-card p-2 sm:p-2.5 shadow-[var(--shadow-elevated)] transition-shadow",
                focused ? "border-choco/50 ring-2 ring-choco/20" : "border-border",
              )}
            >
              <label className="sr-only" htmlFor="hero-prompt">
                Opíš, čo chceš postaviť
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Sparkles className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-success pointer-events-none" />
                  <input
                    id="hero-prompt"
                    name="hero-prompt"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") launch();
                    }}
                    placeholder="Napr. „Landing pre kaviarenský brand s cenníkom“"
                    className="h-12 sm:h-14 w-full rounded-xl border-0 bg-muted/50 pl-10 pr-3 text-sm sm:text-base outline-none placeholder:text-muted-foreground/80 focus:bg-muted/70"
                    autoComplete="off"
                  />
                </div>
                <Button
                  size="lg"
                  className="h-12 sm:h-14 shrink-0 gap-2 px-6"
                  onClick={() => launch()}
                >
                  <Play className="h-4 w-4" />
                  Spustiť v studiu
                </Button>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 px-1 pb-0.5">
                <span className="text-xs text-muted-foreground">Skús:</span>
                {PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setPrompt(p);
                      launch(p);
                    }}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:border-choco/40 transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success" /> Bez inštalácie
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success" /> Free: 20 / deň · 100 / mesiac
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Command className="h-3.5 w-3.5" /> ⌘K v studiu
              </span>
            </div>
          </div>

          <div className="relative mx-auto mt-14 max-w-5xl">
            <div className="absolute -inset-3 sm:-inset-4 rounded-[1.75rem] bg-gradient-to-b from-choco/10 via-transparent to-transparent blur-sm" />
            <div className="relative rounded-[1.35rem] border border-border bg-card/90 p-2 sm:p-3 shadow-[var(--shadow-elevated)] backdrop-blur">
              <div className="mb-2 flex items-center gap-2 px-2 py-1.5">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-danger/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                  <span className="h-2.5 w-2.5 rounded-full bg-success/80" />
                </div>
                <div className="flex-1 text-center">
                  <span className="inline-flex rounded-md bg-muted px-3 py-1 text-xs font-mono text-muted-foreground">
                    studio · 3-column
                  </span>
                </div>
                <div className="w-12" />
              </div>

              <div className="grid gap-2 lg:grid-cols-[0.9fr_1.15fr_0.95fr] min-h-[300px] sm:min-h-[340px]">
                <div className="rounded-2xl border border-border bg-muted/40 p-4 flex flex-col">
                  <div className="flex items-center gap-2 mb-4">
                    <Brain className="h-4 w-4 text-success" />
                    <span className="text-sm font-semibold">Agenti</span>
                    <span className="ml-auto text-xs font-mono text-muted-foreground">
                      G0 → G1 → G2
                    </span>
                  </div>
                  <div className="space-y-2.5 flex-1">
                    {[
                      { name: "Plánovač", status: "hotovo", done: true },
                      { name: "Kóder", status: "hotovo", done: true },
                      { name: "Auditor", status: "beží…", done: false },
                    ].map((a) => (
                      <div
                        key={a.name}
                        className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5"
                      >
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full shrink-0",
                            a.done ? "bg-success" : "bg-choco agent-pulse",
                          )}
                        />
                        <span className="text-sm font-medium">{a.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {a.status}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                    Každý krok je viditeľný — žiadna čierna skrinka.
                  </p>
                </div>

                <div className="rounded-2xl border border-border bg-[#141414] p-4 font-mono text-[12.5px] leading-6 overflow-hidden text-[#e8eaed]">
                  <div className="flex items-center gap-2 mb-3 text-white/70">
                    <Code2 className="h-3.5 w-3.5 text-success" />
                    <span>diff · Hero.tsx</span>
                    <span className="ml-auto text-[11px] rounded bg-white/10 px-1.5 py-0.5">
                      +12 −3
                    </span>
                  </div>
                  <div className="text-red-300/90 bg-red-500/10 px-2 rounded-md">
                    {"−  <h1>Vitajte</h1>"}
                  </div>
                  <div className="text-emerald-300 bg-emerald-500/10 px-2 rounded-md mt-0.5">
                    {"+  <h1>Od vety k náhľadu</h1>"}
                  </div>
                  <div className="text-white/65 px-2 mt-2">
                    {"  <p className=\"text-lg\">…"}
                  </div>
                  <div className="text-emerald-300 bg-emerald-500/10 px-2 rounded-md mt-0.5">
                    {"+  <Button>Spustiť v studiu</Button>"}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <span className="rounded-lg bg-emerald-500/15 text-emerald-300 px-2.5 py-1 text-xs">
                      Schváliť blok
                    </span>
                    <span className="rounded-lg bg-white/8 text-white/75 px-2.5 py-1 text-xs">
                      Zamietnuť
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-muted/40 p-4 flex flex-col">
                  <div className="flex items-center gap-2 mb-3">
                    <Eye className="h-4 w-4 text-success" />
                    <span className="text-sm font-semibold">Live preview</span>
                  </div>
                  <div className="flex-1 rounded-[1.35rem] border-[5px] border-charcoal/15 dark:border-white/15 bg-white dark:bg-canvas-elevated p-4 flex flex-col items-center justify-center text-center shadow-inner min-h-[200px]">
                    <p className="font-serif text-xl font-bold text-charcoal dark:text-[#f2f3f5]">
                      Aurora Café
                    </p>
                    <p className="text-xs text-muted-foreground mt-1.5 max-w-[12rem] leading-relaxed">
                      iPhone 17 Air · 420×912 · safe T68 · chocolate accent
                    </p>
                    <div className="mt-4 h-9 w-28 rounded-xl bg-choco text-white text-xs font-medium flex items-center justify-center">
                      Objednať
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground/80">Stavané pre</span>
            {["Founders", "Marketeri", "Product", "Solo dev"].map((t) => (
              <span key={t} className="font-serif text-base font-semibold tracking-tight">
                {t}
              </span>
            ))}
          </div>
        </section>

        <section id="funkcie" className="py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="max-w-2xl mb-12">
              <p className="label-caps text-choco mb-3">Funkcie</p>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight mb-3 text-balance">
                To, čo reálne beží v studiu
              </h2>
              <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
                Žiadny Figma import, Kernel marketplace ani falošný Pro checkout.
                Brief → pipeline → diff → preview → Accept → share link.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body, span }) => (
                <article
                  key={title}
                  className={cn(
                    "group rounded-3xl border border-border bg-card p-6 sm:p-7 shadow-sm hover:shadow-[var(--shadow-elevated)] hover:border-choco/25 transition-all duration-200",
                    span,
                  )}
                >
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-choco/10 text-choco group-hover:bg-choco group-hover:text-white transition-colors">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="font-serif text-xl font-bold mb-2 leading-snug">
                    {title}
                  </h3>
                  <p className="text-[0.95rem] text-muted-foreground leading-relaxed">
                    {body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="ako" className="border-t border-border bg-muted/35 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center max-w-2xl mx-auto mb-12">
              <p className="label-caps text-choco mb-3">Ako to funguje</p>
              <h2 className="font-serif text-3xl sm:text-4xl font-bold tracking-tight text-balance">
                Tri kroky. Žiadna mágia, plná kontrola.
              </h2>
            </div>
            <ol className="grid gap-4 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li
                  key={s.n}
                  className="relative rounded-3xl border border-border bg-card p-6 sm:p-7"
                >
                  <span className="font-serif text-4xl font-bold text-choco/25">
                    {s.n}
                  </span>
                  <h3 className="font-serif text-xl font-bold mt-2 mb-2">
                    {s.title}
                  </h3>
                  <p className="text-[0.95rem] text-muted-foreground leading-relaxed">
                    {s.body}
                  </p>
                  {i < STEPS.length - 1 && (
                    <ArrowRight className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-success/40 z-10" />
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="rounded-[1.75rem] border border-border bg-card p-8 sm:p-10 flex flex-col max-w-2xl">
              <p className="label-caps text-choco mb-3">Limity</p>
              <h3 className="font-serif text-2xl sm:text-3xl font-bold mb-3">
                Free s reálnym capom. Pro až keď Stripe beží.
              </h3>
              <p className="text-[0.95rem] text-muted-foreground leading-relaxed mb-6 flex-1">
                Free: 20 promptov / deň a 100 / mesiac — enforce na serveri pred
                Mistralom. Checkout tlačidlá sú len ak sú nastavené STRIPE_* kľúče.
              </p>
              <ul className="space-y-2.5 mb-8 text-sm">
                {[
                  "Denný free cap (server 429)",
                  "Live preview + code diff + HitL",
                  "Pro / Enterprise až po konfigurácii Stripe",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-success shrink-0 mt-0.5" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Link to="/pricing" search={{}}>
                  <Button variant="outline" className="gap-2">
                    Zobraziť limity
                  </Button>
                </Link>
                <Link to="/studio">
                  <Button variant="secondary" className="gap-2">
                    Vyskúšať studio
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-24 text-center">
            <h2 className="font-serif text-3xl sm:text-5xl font-bold tracking-tight mb-4 text-balance">
              Pripravený postaviť niečo krásne?
            </h2>
            <p className="text-base sm:text-lg text-muted-foreground max-w-lg mx-auto mb-8 leading-relaxed">
              Otvor studio, napíš prvý prompt a schvaľuj zmeny — ty držíš kľúč od
              každého acceptu.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link to="/studio">
                <Button size="lg" className="h-12 gap-2 px-8">
                  <Sparkles className="h-4 w-4" />
                  Spustiť Cozy AI Studio
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border bg-muted/20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CozyLogo size="sm" variant="seal" />
            <span className="font-medium text-foreground">Cozy AI Studio</span>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            <Link to="/studio" className="hover:text-foreground transition-colors">
              Studio
            </Link>
            <Link to="/connect" className="hover:text-foreground transition-colors">
              WP Connect
            </Link>
            <Link to="/cct" className="hover:text-foreground transition-colors">
              CCT Diff
            </Link>
            <Link to="/pricing" search={{}} className="hover:text-foreground transition-colors">
              Limity
            </Link>
            <Link
              to="/showcase"
              className="hover:text-foreground transition-colors"
            >
              Galéria
            </Link>
            <Link to="/mobile" className="hover:text-foreground transition-colors">
              Mobil
            </Link>
          </div>
          <p className="text-xs">Warm Brutalism · Chocolate · Canvas grey</p>
        </div>
      </footer>
    </div>
  );
}
