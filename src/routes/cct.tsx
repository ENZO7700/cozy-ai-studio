import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { CozyLogo } from "@/components/brand/CozyLogo";
import {
  briefForgeToSectionPatches,
  briefToSectionPatches,
  type BriefForgeMetaboxLike,
  type CctInventory,
  type SectionPatch,
} from "@/lib/wordpress";


export const Route = createFileRoute("/cct")({
  component: CctPage,
  head: () => ({ meta: [{ title: "CCT Diff — Cozy AI Studio" }] }),
  ssr: false,
});

function CctPage() {
  const [inv, setInv] = useState<CctInventory | null>(null);
  const [brief, setBrief] = useState('Hero nadpis: "Cubaxx"\nCTA: "Chcem demo"');
  const [patches, setPatches] = useState<SectionPatch[]>([]);
  const [status, setStatus] = useState("");
  const [iframeKey, setIframeKey] = useState(0);
  const previewUrl = useMemo(() => {
    const base = inv?.baseUrl || "http://localhost:4422";
    return `${base}/?t=${iframeKey}`;
  }, [inv?.baseUrl, iframeKey]);

  const load = useCallback(async () => {
    const res = await fetch("/api/wp/cct");
    const data = (await res.json()) as CctInventory;
    setInv(data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function proposeFromBrief() {
    const trimmed = brief.trim();
    if (trimmed.startsWith("{")) {
      try {
        const payload = JSON.parse(trimmed) as BriefForgeMetaboxLike;
        const next = briefForgeToSectionPatches(payload, {
          heroId: 5,
          seoId: 8,
          pageId: 4,
        });
        setPatches(next);
        setStatus(
          next.length
            ? `BriefForge → ${next.length} patch(es)`
            : "BriefForge: no valid patches (check URL rules)",
        );
        return;
      } catch {
        setStatus("BriefForge JSON parse failed");
        setPatches([]);
        return;
      }
    }
    const next = briefToSectionPatches(brief, { heroId: 5, pageId: 4 });
    setPatches(next);
    setStatus(next.length ? `Proposed ${next.length} patch(es)` : "No valid patches (check URL rules)");
  }

  async function acceptWrite() {
    setStatus("Accept → writing…");
    const res = await fetch("/api/wp/cct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accept: true, patches }),
    });
    const data = (await res.json()) as { ok: boolean; results?: Array<{ error?: string }> };
    if (!data.ok) {
      setStatus(`FAIL: ${data.results?.map((r) => r.error).join("; ") || res.status}`);
      return;
    }
    setStatus("PASS — written. Reloading live pixel…");
    setIframeKey(Date.now());
    await load();
  }

  const hero = inv?.sections?.find((s) => s.type === "hero" && s.post_id === 4);

  return (
    <div className="min-h-screen bg-[#141414] text-[#f4f1ea]">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <CozyLogo className="h-7 w-7" />
          <span className="font-semibold">Cozy · CCT</span>
        </Link>
        <nav className="flex gap-4 text-sm text-white/70">
          <Link to="/connect" className="hover:text-white">
            Connect
          </Link>
          <Link to="/studio" className="hover:text-white">
            Studio
          </Link>
        </nav>
      </header>

      <div className="grid gap-6 px-6 py-6 lg:grid-cols-2">
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Section Graph Diff</h1>
            <span
              className={
                inv?.mode === "live"
                  ? "rounded bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-200"
                  : "rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-200"
              }
            >
              {inv?.mode ?? "…"}
            </span>
          </div>

          <pre className="max-h-48 overflow-auto rounded border border-white/10 bg-black/40 p-3 text-xs text-white/70">
            {hero
              ? `hero #${hero.id}\nnadpis: ${hero.nadpis}\ntext: ${hero.text}\ncta: ${hero.cta_name}`
              : "Loading inventory…"}
          </pre>

          <label className="block text-sm text-white/60">
            UI brief
            <textarea
              className="mt-1 w-full rounded border border-white/15 bg-black/30 p-3 text-sm text-white"
              rows={4}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={proposeFromBrief}>
              Propose patches
            </Button>
            <Button type="button" onClick={() => void acceptWrite()} disabled={!patches.length}>
              Accept → WP
            </Button>
            <Button type="button" variant="ghost" onClick={() => void load()}>
              Refetch inventory
            </Button>
          </div>

          <pre className="max-h-56 overflow-auto rounded border border-[#c4a574]/40 bg-black/40 p-3 text-xs">
            {patches.length
              ? JSON.stringify(patches, null, 2)
              : "# Propose from brief → Diff → Accept"}
          </pre>
          {status && <p className="text-sm text-[#c4a574]">{status}</p>}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm text-white/50">Live pixel · {previewUrl}</h2>
          <iframe
            key={iframeKey}
            title="WP CCT preview"
            src={previewUrl}
            className="h-[70vh] w-full rounded-lg border border-white/10 bg-black"
          />
        </section>
      </div>
    </div>
  );
}
