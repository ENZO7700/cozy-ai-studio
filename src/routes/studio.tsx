import { createFileRoute } from "@tanstack/react-router";
import { StudioShell } from "@/components/studio/StudioShell";

export const Route = createFileRoute("/studio")({
  component: StudioPage,
  head: () => ({
    meta: [{ title: "Studio — Cozy AI Studio" }],
  }),
  ssr: false,
});

function StudioPage() {
  return <StudioShell />;
}
