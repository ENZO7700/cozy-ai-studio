import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { getSupabaseBrowser } from "@/lib/auth/supabase-browser";
import { CozyLogo } from "@/components/brand/CozyLogo";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
  validateSearch: (s: Record<string, unknown>) => ({
    next:
      typeof s.next === "string" && s.next.startsWith("/") ? s.next : "/studio",
  }),
  head: () => ({
    meta: [{ title: "Prihlásenie… — CAI" }],
  }),
});

/**
 * OAuth return URL for Supabase (path A).
 * Exchanges code in URL hash/query for session, then redirects to Studio.
 */
function AuthCallbackPage() {
  const { next } = Route.useSearch();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = getSupabaseBrowser();
      if (!sb) {
        setError("Supabase nie je nakonfigurovaný");
        return;
      }
      try {
        // detectSessionInUrl handles PKCE / hash tokens
        const { data, error: err } = await sb.auth.getSession();
        if (err) throw err;
        if (!data.session) {
          // one more tick for hash parse
          await new Promise((r) => setTimeout(r, 300));
          const again = await sb.auth.getSession();
          if (!again.data.session) {
            throw new Error("Relácia sa nenájdená po OAuth návrate");
          }
        }
        if (!cancelled) {
          navigate({ to: next as "/studio" });
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "OAuth callback zlyhal");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, next]);

  return (
    <main className="min-h-dvh grid place-items-center bg-background px-4">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <CozyLogo size="lg" variant="seal" />
        {error ? (
          <>
            <p className="text-sm text-danger font-medium">{error}</p>
            <a href="/login" className="text-sm text-choco underline">
              Späť na prihlásenie
            </a>
          </>
        ) : (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-choco" />
            <p className="text-sm text-muted-foreground">Dokončujem prihlásenie…</p>
          </>
        )}
      </div>
    </main>
  );
}
