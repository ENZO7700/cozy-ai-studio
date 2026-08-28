import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, GitFork, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStudioStore } from "@/stores/studio-store";

export const Route = createFileRoute("/showcase")({
  component: ShowcasePage,
  head: () => ({
    meta: [{ title: "Showcase — Cozy AI Studio" }],
  }),
});

function ShowcasePage() {
  const showcase = useStudioStore((s) => s.showcase);
  const publishUrl = useStudioStore((s) => s.publishUrl);

  const remix = (name: string) => {
    toast.success(`Remixed “${name}” into your studio`, {
      description: "Open the studio to continue editing",
    });
  };

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-10">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
          <div>
            <p className="text-xs font-semibold tracking-wide text-terracotta uppercase mb-2">
              Community
            </p>
            <h1 className="font-serif text-4xl font-bold">Cozy Showcase</h1>
            <p className="text-muted-foreground mt-2 max-w-md">
              Sample gallery of demo projects. Remix opens Studio — live 1-click publish
              is not sold as shipped yet.
            </p>
          </div>
          <Link to="/studio">
            <Button>Open studio</Button>
          </Link>
        </div>

        {publishUrl && (
          <div className="mb-6 rounded-2xl border border-terracotta/30 bg-terracotta/5 p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-terracotta uppercase tracking-wider">
                Your live project
              </p>
              <p className="font-mono text-sm mt-0.5">{publishUrl}</p>
            </div>
            <span className="text-xs text-muted-foreground">Listed in gallery</span>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {publishUrl && (
            <article className="rounded-2xl border-2 border-terracotta bg-card p-5 shadow-[var(--shadow-brutalist-sm)]">
              <p className="text-xs font-semibold text-terracotta uppercase tracking-wider mb-2">
                Just published
              </p>
              <h2 className="font-serif text-xl font-bold mb-1">Your app</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Live at {publishUrl}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                <ExternalLink className="h-3.5 w-3.5" />
                {publishUrl}
              </div>
            </article>
          )}
          {showcase.map((p) => (
            <article
              key={p.id}
              className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm hover:shadow-[var(--shadow-brutalist-sm)] hover:-translate-x-px hover:-translate-y-px transition-all"
            >
              <div className="flex flex-wrap gap-1.5 mb-3">
                {p.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <h2 className="font-serif text-xl font-bold mb-1">{p.name}</h2>
              <p className="text-sm text-muted-foreground flex-1 mb-4">{p.description}</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  by {p.author} · {p.remixes} remixes
                </span>
                <Button size="sm" variant="secondary" onClick={() => remix(p.name)} className="gap-1.5">
                  <GitFork className="h-3.5 w-3.5" />
                  Remix
                </Button>
              </div>
              <p className="mt-3 text-xs font-mono text-terracotta">{p.url}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
