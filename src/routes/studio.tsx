import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { StudioErrorBoundary } from "@/components/studio/StudioErrorBoundary";

const StudioShell = lazy(() =>
  import("@/components/studio/StudioShell").then((m) => ({
    default: m.StudioShell,
  })),
);

export const Route = createFileRoute("/studio")({
  component: StudioPage,
  head: () => ({
    meta: [{ title: "Studio — Cozy AI Studio" }],
  }),
  ssr: false,
});

function StudioPage() {
  return (
    <StudioErrorBoundary>
      <Suspense
        fallback={
          <div
            className="flex min-h-dvh items-center justify-center text-sm"
            style={{ background: "#f4efe6", color: "#1c1d21" }}
          >
            Načítavam Studio…
          </div>
        }
      >
        <StudioShell />
      </Suspense>
    </StudioErrorBoundary>
  );
}
