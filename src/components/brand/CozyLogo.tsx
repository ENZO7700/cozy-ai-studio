import { cn } from "@/lib/utils";
import { CaiMonogram } from "@/components/brand/CaiMonogram";

type Props = {
  className?: string;
  /** Show wordmark next to mark */
  withWordmark?: boolean;
  /** Compact header size */
  size?: "sm" | "md" | "lg" | "xl";
  /**
   * seal — solid chocolate CAI badge (default)
   * word — wide CAI lettermark
   * stack — CAI + STUDIO
   * glass / cai / mark — aliased to solid seal (legacy glass PNG removed from HOME)
   */
  variant?: "seal" | "word" | "stack" | "glass" | "cai" | "mark";
  wordmarkClassName?: string;
};

/**
 * Primary brand mark: solid Warm Brutalism CAI seal.
 * No translucent / broken PNG that renders as a white rectangle.
 */
export function CozyLogo({
  className,
  withWordmark = false,
  size = "sm",
  variant = "seal",
  wordmarkClassName,
}: Props) {
  // Legacy glass/cai/mark → always solid seal (reliable CSS, never blank box)
  const resolved =
    variant === "word" || variant === "stack" ? variant : "seal";

  return (
    <span className={cn("inline-flex items-center gap-2.5 min-w-0", className)}>
      <CaiMonogram
        size={size === "xl" && resolved === "seal" ? "xl" : size === "xl" ? "xl" : size}
        variant={resolved}
      />
      {withWordmark && <Wordmark className={wordmarkClassName} />}
    </span>
  );
}

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("min-w-0 leading-none", className)}>
      <span className="block font-serif text-base font-bold tracking-[0.2em] truncate">
        Cozy AI Studio
      </span>
      <span className="mt-0.5 block text-[11px] text-muted-foreground font-mono tracking-wide">
        Brief → preview → approve
      </span>
    </span>
  );
}
