import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

type IconProps = SVGProps<SVGSVGElement> & { className?: string };

/** Card / wallet — billing & plans */
export function IconWalletCard({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-4 w-4", className)}
      aria-hidden
      {...props}
    >
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10.5h18" />
      <path d="M7 15h3" />
    </svg>
  );
}

/** Speech bubble — agents chat */
export function IconChatBubble({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-4 w-4", className)}
      aria-hidden
      {...props}
    >
      <path d="M5.5 17.5 4 20l3.2-1.2A8.5 8.5 0 1 0 5.5 17.5Z" />
      <path d="M9 11h.01M12 11h.01M15 11h.01" strokeWidth="2.25" />
    </svg>
  );
}

/** Gear — settings */
export function IconGear({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-4 w-4", className)}
      aria-hidden
      {...props}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.9 7.1l1.6 1.6M17.5 15.3l1.6 1.6M3.5 12h2.2M18.3 12h2.2M4.9 16.9l1.6-1.6M17.5 8.7l1.6-1.6" />
    </svg>
  );
}

/** External / open window arrow */
export function IconOpenWindow({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-3.5 w-3.5", className)}
      aria-hidden
      {...props}
    >
      <path d="M10 5H5.5A1.5 1.5 0 0 0 4 6.5v12A1.5 1.5 0 0 0 5.5 20h12a1.5 1.5 0 0 0 1.5-1.5V14" />
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
    </svg>
  );
}

/** Neon green status check (reference style) */
export function IconStatusCheck({ className, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn("h-4 w-4 text-success", className)}
      aria-hidden
      {...props}
    >
      <path
        d="M5 12.5 10 17.5 19 6.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Compact toolbar — icons in status green on hover/active */
export function StudioChromeIcons({
  onBilling,
  onChat,
  onSettings,
  className,
}: {
  onBilling?: () => void;
  onChat?: () => void;
  onSettings?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border border-border/80 bg-background/60 p-1",
        className,
      )}
    >
      <button
        type="button"
        onClick={onBilling}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-success/10 hover:text-success transition-colors"
        aria-label="Billing & plans"
        title="Billing"
      >
        <IconWalletCard />
      </button>
      <button
        type="button"
        onClick={onChat}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-success/10 hover:text-success transition-colors"
        aria-label="Agents chat"
        title="Agents chat"
      >
        <IconChatBubble />
      </button>
      <button
        type="button"
        onClick={onSettings}
        className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-success/10 hover:text-success transition-colors"
        aria-label="Settings"
        title="Settings"
      >
        <IconGear />
      </button>
    </div>
  );
}
