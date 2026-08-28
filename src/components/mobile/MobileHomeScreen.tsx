import { Link } from "@tanstack/react-router";
import {
  Boxes,
  Eye,
  Home,
  LayoutGrid,
  ShoppingBag,
  UserRound,
  UserCheck,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CozyLogo } from "@/components/brand/CozyLogo";

/**
 * Single-viewport (100vh) mobile HOME — no page scroll.
 * Typography + gaps scale with viewport height so SE → Air all fit.
 */
export function MobileHomeScreen() {
  return (
    <div className="cosy-screen bg-[#0c0c0e] text-[#f3ebe3] md:hidden">
      <div className="cosy-screen-body">
        {/* Mini product preview chrome */}
        <div
          className="shrink-0 overflow-hidden rounded-xl border border-white/10 bg-[#1a1a1e]"
          style={{ height: "var(--preview-h)" }}
        >
          <div className="flex h-7 items-center justify-end gap-1.5 border-b border-white/8 bg-[#121214] px-2">
            <span className="rounded-md border border-white/12 px-2 py-0.5 text-[10px] text-white/55">
              Sign In
            </span>
            <span className="rounded-md bg-choco px-2 py-0.5 text-[10px] font-medium text-white">
              Sign
            </span>
          </div>
          <div className="flex h-[calc(100%-1.75rem)] items-center justify-center bg-[#e8e2da]">
            <CozyLogo size="md" variant="seal" className="opacity-90" />
          </div>
        </div>

        {/* Brand */}
        <header className="shrink-0 text-center pt-[0.35vh]">
          <p
            className="font-serif font-bold tracking-[0.18em] text-[#f3ebe3]"
            style={{ fontSize: "var(--title-size)" }}
          >
            COSY STUDIO
          </p>
          <p
            className="mt-0.5 font-mono uppercase tracking-[0.28em] text-white/45"
            style={{ fontSize: "var(--subtitle-size)" }}
          >
            AI Visual IDE
          </p>
          <p
            className="mt-[1.2vh] text-white/70 leading-snug"
            style={{ fontSize: "var(--body-size)" }}
          >
            Design. Diff. Deploy.
            <br />
            <span className="text-white/45">Without context switching.</span>
          </p>
        </header>

        {/* Feature rows — fixed count, no grow past viewport */}
        <ul className="flex min-h-0 flex-1 flex-col justify-center gap-[var(--screen-gap)]">
          {(
            [
              {
                icon: Boxes,
                title: "Multi-Agent AI",
                body: "G0 → G1 → G2 pipeline",
              },
              {
                icon: Eye,
                title: "Live Preview",
                body: "Instant device frames",
              },
              {
                icon: UserCheck,
                title: "Human-in-the-Loop",
                body: "Approve every diff",
              },
            ] as const
          ).map(({ icon: Icon, title, body }) => (
            <li
              key={title}
              className="flex items-center gap-3 border border-white/10 bg-[#16161a]"
              style={{
                padding: "var(--card-pad)",
                borderRadius: "var(--card-radius)",
              }}
            >
              <span
                className="flex shrink-0 items-center justify-center rounded-xl bg-choco/20 text-choco"
                style={{
                  width: "var(--icon-box)",
                  height: "var(--icon-box)",
                }}
              >
                <Icon className="h-[45%] w-[45%]" strokeWidth={2.25} />
              </span>
              <div className="min-w-0 leading-tight">
                <p
                  className="font-semibold text-[#f3ebe3]"
                  style={{ fontSize: "var(--body-size)" }}
                >
                  {title}
                </p>
                <p
                  className="text-white/45"
                  style={{ fontSize: "var(--subtitle-size)" }}
                >
                  {body}
                </p>
              </div>
            </li>
          ))}
        </ul>

        {/* CTAs */}
        <div className="shrink-0 space-y-[var(--screen-gap)] pb-[0.5vh]">
          <Link
            to="/studio"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-choco font-semibold text-white shadow-[0_4px_0_0_#4a2a14] active:translate-y-0.5 active:shadow-none"
            style={{ height: "var(--btn-h)", fontSize: "var(--body-size)" }}
          >
            <Sparkles className="h-4 w-4" />
            Open Studio
          </Link>
          <Link
            to="/playground"
            className="flex w-full items-center justify-center rounded-2xl border border-white/14 bg-transparent font-medium text-white/85 active:bg-white/5"
            style={{ height: "var(--btn-h)", fontSize: "var(--body-size)" }}
          >
            Dashboard →
          </Link>
          <p
            className="text-center text-white/35"
            style={{ fontSize: "var(--subtitle-size)" }}
          >
            Mobile-first shell · Orders · PC profile
          </p>
        </div>
      </div>

      {/* Bottom tabs — always visible, never pushes content past 100vh */}
      <nav className="cosy-screen-tabs border-white/10 bg-[#0c0c0e]" aria-label="Primary">
        {(
          [
            { to: "/" as const, icon: Home, label: "Home", active: true },
            { to: "/playground" as const, icon: LayoutGrid, label: "Dashboard", active: false },
            { to: "/showcase" as const, icon: ShoppingBag, label: "Orders", active: false },
            { to: "/login" as const, icon: UserRound, label: "Profile", active: false },
          ] as const
        ).map(({ to, icon: Icon, label, active }) => (
          <Link
            key={label}
            to={to}
            data-active={active ? "true" : "false"}
            className={cn(active && "text-choco")}
          >
            <Icon className="h-4 w-4" strokeWidth={active ? 2.4 : 2} />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Desktop-only spacer — MobileHomeScreen is md:hidden */
export function MobileHomeGate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MobileHomeScreen />
      <div className="hidden md:block">{children}</div>
    </>
  );
}
