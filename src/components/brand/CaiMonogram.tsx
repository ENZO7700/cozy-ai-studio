import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  /** seal = filled chocolate badge; word = CAI caps; stack = CAI + STUDIO */
  variant?: "seal" | "word" | "stack";
  tone?: "brand" | "ink" | "on-dark";
  title?: string;
};

const sealBox = {
  sm: "h-9 w-9",
  md: "h-11 w-11",
  lg: "h-[4.5rem] w-[4.5rem]",
  xl: "h-28 w-28",
} as const;

const sealType = {
  sm: "text-[0.62rem] tracking-[0.14em]",
  md: "text-[0.72rem] tracking-[0.16em]",
  lg: "text-[1.05rem] tracking-[0.18em]",
  xl: "text-[1.55rem] tracking-[0.2em]",
} as const;

const wordType = {
  sm: "text-lg tracking-[0.28em]",
  md: "text-xl tracking-[0.3em]",
  lg: "text-3xl tracking-[0.32em]",
  xl: "text-5xl tracking-[0.34em]",
} as const;

/**
 * Cozy AI Studio monogram — solid Warm Brutalism seal.
 * Filled chocolate disc + cream CAI (never a blank white box).
 */
export function CaiMonogram({
  className,
  size = "sm",
  variant = "seal",
  tone = "brand",
  title = "CAI — Cozy AI Studio",
}: Props) {
  if (variant === "word") {
    const ink =
      tone === "on-dark"
        ? "text-white"
        : tone === "ink"
          ? "text-charcoal dark:text-zinc-100"
          : "text-choco-dark dark:text-choco";
    return (
      <span
        role="img"
        aria-label={title}
        title={title}
        className={cn(
          "inline-flex flex-col items-center justify-center select-none",
          ink,
          className,
        )}
      >
        <span
          className={cn(
            "font-serif font-bold leading-none uppercase",
            wordType[size],
          )}
        >
          CAI
        </span>
        <span
          className={cn(
            "mt-1 block h-px w-[85%] max-w-[8rem]",
            tone === "on-dark" ? "bg-white/40" : "bg-choco/40",
          )}
        />
      </span>
    );
  }

  if (variant === "stack") {
    const ink =
      tone === "on-dark"
        ? "text-white"
        : tone === "ink"
          ? "text-charcoal dark:text-zinc-100"
          : "text-choco-dark dark:text-choco";
    return (
      <span
        role="img"
        aria-label={title}
        title={title}
        className={cn(
          "inline-flex flex-col items-center justify-center select-none gap-1.5",
          ink,
          className,
        )}
      >
        <span
          className={cn(
            "font-serif font-bold leading-none uppercase",
            size === "xl"
              ? "text-5xl tracking-[0.28em]"
              : size === "lg"
                ? "text-4xl tracking-[0.26em]"
                : "text-2xl tracking-[0.24em]",
          )}
        >
          CAI
        </span>
        <span
          className={cn(
            "h-px w-16 sm:w-20",
            tone === "on-dark" ? "bg-white/40" : "bg-choco/45",
          )}
        />
        <span className="font-sans font-semibold uppercase text-[0.65rem] sm:text-xs tracking-[0.42em] opacity-80">
          Studio
        </span>
      </span>
    );
  }

  // Solid chocolate seal — always visible on cream AND dark (no empty white box)
  return (
    <span
      role="img"
      aria-label={title}
      title={title}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center select-none rounded-full",
        sealBox[size],
        // solid fill — never translucent ghost on light theme
        "bg-choco text-[#f3ebe3]",
        "border-2 border-[#3d2314]/90",
        "shadow-[2px_2px_0_0_#3d2314]",
        className,
      )}
    >
      {/* inner cream ring */}
      <span
        className="pointer-events-none absolute inset-[3px] rounded-full border border-[#f3ebe3]/35"
        aria-hidden
      />
      <span
        className={cn(
          "relative font-serif font-bold uppercase leading-none text-[#f3ebe3]",
          sealType[size],
        )}
      >
        CAI
      </span>
    </span>
  );
}

export function CaiBrandLink({
  className,
  size = "sm",
  showWord = true,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  showWord?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5 min-w-0", className)}>
      <CaiMonogram size={size} variant="seal" />
      {showWord && (
        <span className="min-w-0 leading-none hidden sm:block">
          <span className="block font-serif text-base font-bold tracking-[0.2em] truncate">
            CAI
          </span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground font-mono tracking-wide">
            Cozy AI Studio
          </span>
        </span>
      )}
    </span>
  );
}
