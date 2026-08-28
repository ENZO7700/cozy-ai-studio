import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Rocket,
  Check,
  Loader2,
  X,
  CreditCard,
  Shield,
  Globe,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { useStudioStore, type PlanTier } from "@/stores/studio-store";
import {
  createInitialLaunchSteps,
  runProductionLaunch,
  type LaunchStep,
} from "@/lib/production/launch-pipeline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Link, useNavigate } from "@tanstack/react-router";

type Phase = "idle" | "confirm" | "running" | "done" | "failed";

export function ProductionLaunchButton({
  className,
  stripeConfigured,
}: {
  className?: string;
  stripeConfigured?: boolean;
}) {
  const setOpen = useStudioStore((s) => s.setProductionLaunchOpen);
  const isLive = useStudioStore((s) => s.productionLive);
  const isRunning = useStudioStore((s) => s.productionLaunchRunning);
  const storeStripe = useStudioStore((s) => s.stripeConfigured);
  const liveBilling = stripeConfigured ?? storeStripe;
  const navigate = useNavigate();
  const [vercelReady, setVercelReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/launch/run")
      .then((r) => r.json())
      .then((j: { vercelReady?: boolean }) => {
        if (!cancelled) setVercelReady(Boolean(j.vercelReady));
      })
      .catch(() => {
        if (!cancelled) setVercelReady(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onClick = () => {
    // Prompt C: real Vercel redeploy without Stripe when keys present
    if (vercelReady) {
      setOpen(true);
      return;
    }
    if (!liveBilling && !isLive) {
      void navigate({ to: "/pricing", search: {} });
      toast.message("Deploy ešte nie je nastavený", {
        description:
          "Free publish: Share → /a/:id. Platený full launch potrebuje Stripe. Redeploy potrebuje VERCEL_TOKEN + PROJECT_ID.",
      });
      return;
    }
    setOpen(true);
  };

  const label = isLive
    ? "Live"
    : isRunning
      ? "Deploying…"
      : vercelReady
        ? liveBilling
          ? "Deploy"
          : "Redeploy"
        : liveBilling
          ? "Deploy"
          : "Limits";

  return (
    <Button
      size="sm"
      variant={isLive ? "default" : "outline"}
      className={cn(
        "h-9 text-xs gap-1.5",
        isLive && "bg-success hover:bg-success/90 text-white border-success",
        !vercelReady && !liveBilling && !isLive && "text-muted-foreground",
        className,
      )}
      onClick={onClick}
      disabled={isRunning}
      title={
        vercelReady
          ? liveBilling
            ? "Production launch (Stripe + Vercel)"
            : "Redeploy produkcie cez Vercel (bez Stripe)"
          : "Chýbajú Vercel kľúče — Limity / cenník"
      }
    >
      <Rocket className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">
        {isLive ? "Live" : vercelReady ? "Prod" : "Plan"}
      </span>
    </Button>
  );
}

export function ProductionLaunchHost() {
  const open = useStudioStore((s) => s.productionLaunchOpen);
  const setOpen = useStudioStore((s) => s.setProductionLaunchOpen);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <ProductionLaunchModal onClose={() => setOpen(false)} />,
    document.body,
  );
}

function ProductionLaunchModal({ onClose }: { onClose: () => void }) {
  const planTier = useStudioStore((s) => s.planTier);
  const setPlanTier = useStudioStore((s) => s.setPlanTier);
  const storeStripe = useStudioStore((s) => s.stripeConfigured);
  const liveBilling = storeStripe;
  const setPublishUrl = useStudioStore((s) => s.setPublishUrl);
  const addTelemetry = useStudioStore((s) => s.addTelemetry);
  const addChat = useStudioStore((s) => s.addChat);
  const publishUrl = useStudioStore((s) => s.publishUrl);
  const productionLive = useStudioStore((s) => s.productionLive);
  const productionInvoiceId = useStudioStore((s) => s.productionInvoiceId);
  const productionPrepaidCredits = useStudioStore((s) => s.productionPrepaidCredits);
  const setProductionState = useStudioStore((s) => s.setProductionState);

  const [phase, setPhase] = useState<Phase>(productionLive ? "done" : "confirm");
  const [steps, setSteps] = useState<LaunchStep[]>(() => {
    const s = createInitialLaunchSteps();
    return productionLive ? s.map((x) => ({ ...x, status: "done" as const })) : s;
  });
  const [progress, setProgress] = useState(productionLive ? 100 : 0);
  const [progressLabel, setProgressLabel] = useState(productionLive ? "Live" : "");
  const [selectedPlan, setSelectedPlan] = useState<"PRO" | "ENTERPRISE">(
    planTier === "ENTERPRISE" ? "ENTERPRISE" : "PRO",
  );
  const [projectName, setProjectName] = useState("my-cai-app");
  const [resultUrl, setResultUrl] = useState(publishUrl ?? "");
  const [invoiceId, setInvoiceId] = useState(productionInvoiceId ?? "");
  const [prepaid, setPrepaid] = useState(
    productionPrepaidCredits > 0 ? productionPrepaidCredits : 50_000,
  );
  const [error, setError] = useState<string | null>(null);
  const [abortCtrl, setAbortCtrl] = useState<AbortController | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "running") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, phase]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const startLaunch = useCallback(async () => {
    setError(null);
    setCheckoutUrl(null);
    setPhase("running");
    setSteps(createInitialLaunchSteps());
    setProgress(0);
    setProgressLabel("Starting…");
    setProductionState({
      productionLaunchRunning: true,
      productionLive: false,
    });

    const ac = new AbortController();
    setAbortCtrl(ac);
    const t0 = Date.now();

    try {
      const launchMode =
        liveBilling || storeStripe ? ("full" as const) : ("redeploy" as const);
      const result = await runProductionLaunch(
        { projectName, preferredPlan: selectedPlan, mode: launchMode },
        {
          signal: ac.signal,
          onSteps: setSteps,
          onStep: () => {},
          onProgress: (pct, label) => {
            setProgress(pct);
            setProgressLabel(label);
          },
          onCheckoutRequired: (url) => {
            setCheckoutUrl(url);
            toast.message("Stripe Checkout required", {
              description: "Complete payment, then re-run launch.",
              action: {
                label: "Open Checkout",
                onClick: () => {
                  window.location.href = url;
                },
              },
            });
          },
        },
      );

      setPlanTier(result.planTier);
      setPublishUrl(result.publishUrl);
      setResultUrl(result.publishUrl);
      setInvoiceId(result.invoiceId);
      setPrepaid(result.prepaidCredits);
      setProductionState({
        productionLive: true,
        productionLaunchRunning: false,
        productionRegion: result.region,
        productionPrepaidCredits: result.prepaidCredits,
        productionInvoiceId: result.invoiceId,
      });
      addTelemetry({
        prompt: `production_launch:${result.publishUrl}`,
        status: "APPROVED",
        agentType: "PRODUCTION",
        latencyMs: Date.now() - t0,
      });
      addChat({
        role: "system",
        content: [
          "Live in production.",
          `https://${result.publishUrl}`,
          `${result.planTier} · ${result.prepaidCredits.toLocaleString()} tokens · ${result.invoiceId}`,
        ].join("\n"),
      });
      setPhase("done");
      setProgress(100);
      setProgressLabel("Live");
      toast.success("App is live", {
        description: `https://${result.publishUrl}`,
      });
    } catch (e) {
      const aborted =
        (e instanceof DOMException && e.name === "AbortError") ||
        (e instanceof Error && e.name === "AbortError");
      setProductionState({ productionLaunchRunning: false });
      setPhase("failed");
      setError(aborted ? "Cancelled." : e instanceof Error ? e.message : "Failed");
      toast[aborted ? "message" : "error"](
        aborted ? "Launch cancelled" : "Launch failed",
      );
    } finally {
      setAbortCtrl(null);
    }
  }, [
    projectName,
    selectedPlan,
    setPlanTier,
    setPublishUrl,
    setProductionState,
    addTelemetry,
    addChat,
  ]);

  const cancelLaunch = () => {
    abortCtrl?.abort();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center bg-charcoal/55 backdrop-blur-sm p-0 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="prod-launch-title"
        className="relative z-[201] flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border border-border bg-card shadow-[var(--shadow-elevated)]"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-choco mb-1">
              Production
            </p>
            <h2
              id="prod-launch-title"
              className="font-serif text-xl font-bold leading-tight"
            >
              {phase === "done" ? "You're live" : "Go to Production"}
            </h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              Real pipeline: typecheck → Stripe → build → Vercel deploy → healthcheck.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={() => {
              if (phase === "running") return;
              onClose();
            }}
            aria-label="Close"
            disabled={phase === "running"}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto cosy-scroll px-5 py-4 space-y-4">
          {phase === "confirm" && (
            <ConfirmStep
              projectName={projectName}
              setProjectName={setProjectName}
              selectedPlan={selectedPlan}
              setSelectedPlan={setSelectedPlan}
              planTier={planTier}
            />
          )}

          {(phase === "running" || phase === "done" || phase === "failed") && (
            <RunningSteps
              steps={steps}
              progress={progress}
              progressLabel={progressLabel}
              phase={phase}
              error={error}
              resultUrl={resultUrl}
              invoiceId={invoiceId}
              selectedPlan={selectedPlan}
              prepaid={prepaid}
              checkoutUrl={checkoutUrl}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3 bg-muted/30">
          {phase === "confirm" && (
            <>
              <p className="text-xs text-muted-foreground">
                Requires active Stripe plan + Vercel deploy credentials.
              </p>
              <div className="flex gap-2 ml-auto">
                <Button variant="secondary" size="sm" className="h-10" onClick={onClose}>
                  Later
                </Button>
                <Button
                  size="sm"
                  className="h-10 gap-1.5"
                  onClick={() => void startLaunch()}
                >
                  <Rocket className="h-4 w-4" />
                  Start launch
                </Button>
              </div>
            </>
          )}

          {phase === "running" && (
            <>
              <p className="text-xs font-mono text-muted-foreground">{progressLabel}</p>
              <Button
                variant="danger"
                size="sm"
                className="h-10 ml-auto"
                onClick={cancelLaunch}
              >
                Cancel
              </Button>
            </>
          )}

          {(phase === "done" || phase === "failed") && (
            <>
              {phase === "done" && resultUrl && (
                <a
                  href={
                    resultUrl.startsWith("http")
                      ? resultUrl
                      : `https://${resultUrl}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-choco font-medium hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {resultUrl}
                </a>
              )}
              <div className="flex gap-2 ml-auto">
                {phase === "failed" && checkoutUrl && (
                  <Button
                    size="sm"
                    className="h-10 gap-1.5"
                    onClick={() => {
                      window.location.href = checkoutUrl;
                    }}
                  >
                    <CreditCard className="h-4 w-4" />
                    Stripe Checkout
                  </Button>
                )}
                {phase === "failed" && (
                  <Button
                    size="sm"
                    variant={checkoutUrl ? "secondary" : "default"}
                    className="h-10"
                    onClick={() => {
                      setPhase("confirm");
                      setError(null);
                      setCheckoutUrl(null);
                    }}
                  >
                    Retry
                  </Button>
                )}
                {phase === "done" && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-10"
                    onClick={() => {
                      setProductionState({ productionLive: false });
                      setPhase("confirm");
                      setSteps(createInitialLaunchSteps());
                      setProgress(0);
                    }}
                  >
                    Relaunch
                  </Button>
                )}
                <Button size="sm" className="h-10" onClick={onClose}>
                  Done
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ConfirmStep({
  projectName,
  setProjectName,
  selectedPlan,
  setSelectedPlan,
  planTier,
}: {
  projectName: string;
  setProjectName: (v: string) => void;
  selectedPlan: "PRO" | "ENTERPRISE";
  setSelectedPlan: (v: "PRO" | "ENTERPRISE") => void;
  planTier: PlanTier;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Shield, title: "Checks", text: "typecheck + build" },
          { icon: CreditCard, title: "Stripe", text: "Active subscription" },
          { icon: Globe, title: "Vercel", text: "Deploy + healthcheck" },
        ].map(({ icon: Icon, title, text }) => (
          <div
            key={title}
            className="rounded-2xl border border-border bg-background/60 p-3"
          >
            <Icon className="h-4 w-4 text-choco mb-2" />
            <p className="text-xs font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{text}</p>
          </div>
        ))}
      </div>

      <label htmlFor="launch-project-name" className="block space-y-1.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Project name
        </span>
        <input
          id="launch-project-name"
          name="projectName"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-choco focus:ring-1 focus:ring-choco/30 font-mono"
          placeholder="my-app"
          autoComplete="organization"
        />
      </label>

      <div className="space-y-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Target plan
        </span>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              { id: "PRO" as const, price: "$29/mo", blurb: "For builders" },
              {
                id: "ENTERPRISE" as const,
                price: "$49/seat",
                blurb: "Teams",
              },
            ] as const
          ).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPlan(p.id)}
              className={cn(
                "rounded-2xl border p-3 text-left transition-colors min-h-16",
                selectedPlan === p.id
                  ? "border-choco bg-choco/10"
                  : "border-border hover:border-choco/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-serif font-semibold text-sm">{p.id}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {p.price}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{p.blurb}</p>
            </button>
          ))}
        </div>
        {planTier === "FREE" && (
          <p className="text-xs text-amber-800 dark:text-amber-200 bg-amber-500/10 rounded-lg px-2 py-1.5">
            Current plan is FREE. Launch will open Stripe Checkout if you are
            not subscribed.{" "}
            <Link
              to="/pricing"
              search={{}}
              className="underline underline-offset-2 font-medium"
            >
              View pricing
            </Link>
          </p>
        )}
        {(planTier === "PRO" || planTier === "ENTERPRISE") && (
          <p className="text-xs text-success bg-success/10 rounded-lg px-2 py-1.5">
            Server plan: {planTier} — billing step will verify via Stripe webhook
            state.
          </p>
        )}
      </div>
    </div>
  );
}

function RunningSteps({
  steps,
  progress,
  progressLabel,
  phase,
  error,
  resultUrl,
  invoiceId,
  selectedPlan,
  prepaid,
  checkoutUrl,
}: {
  steps: LaunchStep[];
  progress: number;
  progressLabel: string;
  phase: Phase;
  error: string | null;
  resultUrl: string;
  invoiceId: string;
  selectedPlan: "PRO" | "ENTERPRISE";
  prepaid: number;
  checkoutUrl: string | null;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs font-mono text-muted-foreground">
          <span>{progressLabel || "Working…"}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-300",
              phase === "failed" ? "bg-danger" : "bg-choco",
            )}
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      </div>

      <ol className="space-y-1.5">
        {steps.map((step, i) => (
          <li
            key={step.id}
            className={cn(
              "flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
              step.status === "running" && "border-choco/40 bg-choco/5",
              step.status === "done" && "border-border bg-background/50",
              step.status === "failed" && "border-danger/40 bg-danger-bg/40",
              step.status === "pending" && "border-transparent opacity-60",
            )}
          >
            <div className="mt-0.5 shrink-0">
              {step.status === "done" && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-white">
                  <Check className="h-3 w-3" />
                </div>
              )}
              {step.status === "running" && (
                <Loader2 className="h-5 w-5 animate-spin text-choco" />
              )}
              {step.status === "failed" && (
                <AlertCircle className="h-5 w-5 text-danger" />
              )}
              {step.status === "pending" && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full border border-border text-xs font-mono text-muted-foreground">
                  {i + 1}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">{step.title}</p>
              <p className="text-xs text-muted-foreground">{step.description}</p>
              {step.detail && (
                <p className="mt-1 font-mono text-xs text-foreground/80 break-all">
                  {step.detail}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {phase === "done" && resultUrl && (
        <div className="rounded-2xl border border-success/30 bg-success/10 p-4">
          <p className="font-serif text-base font-bold">Live</p>
          <p className="mt-1 font-mono text-sm text-choco">
            https://{resultUrl.replace(/^https?:\/\//, "")}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {selectedPlan} · {prepaid.toLocaleString()} tokens
            {invoiceId ? ` · ${invoiceId}` : ""}
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-danger/30 bg-danger-bg/50 px-3 py-2 text-xs text-danger space-y-2">
          <p>{error}</p>
          {checkoutUrl && (
            <a
              href={checkoutUrl}
              className="inline-flex items-center gap-1 font-medium underline underline-offset-2"
            >
              <CreditCard className="h-3.5 w-3.5" />
              Open Stripe Checkout
            </a>
          )}
        </div>
      )}
    </div>
  );
}
