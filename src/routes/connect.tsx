import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { CozyLogo } from "@/components/brand/CozyLogo";

export const Route = createFileRoute("/connect")({
  component: ConnectPage,
  head: () => ({ meta: [{ title: "Connect WP CCT — Cozy AI Studio" }] }),
  ssr: false,
});

type EnvInfo = {
  baseUrl: string;
  username: string;
  mirror: boolean;
  hasAppPassword: boolean;
};

function ConnectPage() {
  const [env, setEnv] = useState<EnvInfo | null>(null);
  const [testMsg, setTestMsg] = useState<string>("");
  const [ok, setOk] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/wp/cct?action=env");
    const data = (await res.json()) as EnvInfo & { ok?: boolean };
    setEnv(data);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function testConnection() {
    setTestMsg("Testing…");
    const res = await fetch("/api/wp/cct?action=test");
    const data = (await res.json()) as { ok: boolean; mode: string; message: string };
    setOk(data.ok);
    setTestMsg(`${data.mode}: ${data.message}`);
  }

  return (
    <div className="min-h-screen bg-[#141414] text-[#f4f1ea]">
      <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <CozyLogo className="h-7 w-7" />
          <span className="font-semibold tracking-tight">Cozy · WP Connect</span>
        </Link>
        <nav className="flex gap-4 text-sm text-white/70">
          <Link to="/cct" className="hover:text-white">
            CCT Diff
          </Link>
          <Link to="/studio" className="hover:text-white">
            Studio
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-xl space-y-6 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">WordPress CCT</h1>
        <p className="text-sm text-white/60">
          Local preset: <code className="text-[#c4a574]">http://localhost:4422</code>. Credentials
          only on server (<code>WP_*</code> in <code>.env.local</code>).
        </p>

        {env && (
          <div className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
            <div className="flex items-center justify-between">
              <span>Mode</span>
              <span
                className={
                  env.mirror
                    ? "rounded bg-amber-500/20 px-2 py-0.5 text-amber-200"
                    : "rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-200"
                }
              >
                {env.mirror ? "mirror / local-cct-mirror" : "live"}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span>Base URL</span>
              <code className="truncate text-white/80">{env.baseUrl}</code>
            </div>
            <div className="flex justify-between">
              <span>User</span>
              <code>{env.username}</code>
            </div>
            <div className="flex justify-between">
              <span>App password</span>
              <span>{env.hasAppPassword ? "set (server)" : "missing → mirror"}</span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="button" onClick={() => void testConnection()}>
            Test connection
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link to="/cct">Open CCT / Section Graph</Link>
          </Button>
        </div>

        {testMsg && (
          <p className={`text-sm ${ok ? "text-emerald-300" : ok === false ? "text-red-300" : "text-white/60"}`}>
            {testMsg}
          </p>
        )}

        <ol className="list-decimal space-y-1 pl-5 text-sm text-white/50">
          <li>
            Copy App Password from <code>local-wp/CREDENTIALS.local.md</code> into{" "}
            <code>WP_APP_PASSWORD</code>
          </li>
          <li>Restart <code>npm run dev</code></li>
          <li>Accept writes require <code>accept:true</code> (HitL)</li>
        </ol>
      </main>
    </div>
  );
}
