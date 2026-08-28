import { useEffect } from "react";
import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { CozyLogo } from "@/components/brand/CozyLogo";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [{ title: "Studio — CAI · Cozy AI Studio" }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    redirect:
      typeof search.redirect === "string" && search.redirect.startsWith("/")
        ? search.redirect
        : "/studio",
  }),
});

/** Auth UI removed — open access. Redirect to Studio. */
function LoginPage() {
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: redirect as "/studio" });
  }, [redirect, navigate]);

  return (
    <main className="min-h-dvh grid place-items-center bg-background px-4 py-10">
      <div className="w-full max-w-md text-center space-y-6">
        <CozyLogo size="lg" variant="seal" className="mx-auto" />
        <p className="text-sm text-muted-foreground">
          Prihlásenie je vypnuté — otváram Studio…
        </p>
        <Button asChild className="rounded-xl">
          <Link to="/studio">Do Studia</Link>
        </Button>
        <Navigate to={redirect as "/studio"} />
      </div>
    </main>
  );
}
