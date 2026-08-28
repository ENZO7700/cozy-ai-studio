/**
 * Production env checklist — booleans + masked fingerprints only.
 */

import { secretFingerprint } from "@/lib/security/mask-secret";
import { resolveAuthProvider, supabaseConfiguredServer } from "@/lib/auth/mode";

export type EnvCheck = {
  key: string;
  set: boolean;
  required: boolean;
  group: "ai" | "db" | "auth" | "stripe" | "vercel" | "flags";
  note?: string;
  fingerprint?: string | null;
};

function set(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

function envVal(name: string): string | undefined {
  const v = process.env[name];
  return typeof v === "string" && v.trim() ? v : undefined;
}

export function getProductionEnvChecklist(): {
  ready: boolean;
  demoPipeline: boolean;
  authProvider: string;
  checks: EnvCheck[];
  missingRequired: string[];
} {
  const demoPipeline =
    process.env.DEMO_PIPELINE === "true" ||
    process.env.VITE_DEMO_PIPELINE === "true";
  const authProvider = resolveAuthProvider("server");
  const supabasePath = authProvider === "supabase" || supabaseConfiguredServer();
  const betterPath = authProvider === "better-auth";

  const checks: EnvCheck[] = [
    {
      key: "AUTH_PROVIDER",
      set: true,
      required: false,
      group: "flags",
      note: `resolved=${authProvider}`,
    },
    {
      key: "MISTRAL_API_KEY",
      set: set("MISTRAL_API_KEY"),
      required: !demoPipeline,
      group: "ai",
    },
    {
      key: "DEMO_PIPELINE",
      set: true,
      required: false,
      group: "flags",
      note: demoPipeline ? "true (mock)" : "false (prod AI)",
    },
    {
      key: "DATABASE_URL",
      set: set("DATABASE_URL"),
      required: true,
      group: "db",
      note: "Supabase pooler or Neon URI",
    },
    // Path A
    {
      key: "SUPABASE_URL",
      set: set("SUPABASE_URL"),
      required: supabasePath && authProvider === "supabase",
      group: "auth",
      note: "Path A",
    },
    {
      key: "SUPABASE_ANON_KEY",
      set: set("SUPABASE_ANON_KEY") || set("VITE_SUPABASE_ANON_KEY"),
      required: authProvider === "supabase",
      group: "auth",
    },
    {
      key: "SUPABASE_SERVICE_ROLE_KEY",
      set: set("SUPABASE_SERVICE_ROLE_KEY"),
      required: authProvider === "supabase",
      group: "auth",
      note: "Server only",
    },
    {
      key: "VITE_SUPABASE_URL",
      set: set("VITE_SUPABASE_URL"),
      required: authProvider === "supabase",
      group: "auth",
      note: "Browser client",
    },
    {
      key: "VITE_SUPABASE_ANON_KEY",
      set: set("VITE_SUPABASE_ANON_KEY"),
      required: authProvider === "supabase",
      group: "auth",
    },
    // Path B
    {
      key: "BETTER_AUTH_SECRET",
      set: set("BETTER_AUTH_SECRET"),
      required: betterPath,
      group: "auth",
      note: "Path B",
    },
    {
      key: "BETTER_AUTH_URL",
      set: set("BETTER_AUTH_URL"),
      required: betterPath,
      group: "auth",
    },
    // Stripe MUST
    {
      key: "STRIPE_SECRET_KEY",
      set: set("STRIPE_SECRET_KEY"),
      required: true,
      group: "stripe",
    },
    {
      key: "STRIPE_WEBHOOK_SECRET",
      set: set("STRIPE_WEBHOOK_SECRET"),
      required: true,
      group: "stripe",
    },
    {
      key: "STRIPE_PRICE_PRO",
      set: set("STRIPE_PRICE_PRO"),
      required: true,
      group: "stripe",
    },
    {
      key: "STRIPE_PRICE_ENTERPRISE",
      set: set("STRIPE_PRICE_ENTERPRISE"),
      required: true,
      group: "stripe",
    },
    {
      key: "VERCEL_TOKEN",
      set: set("VERCEL_TOKEN"),
      required: false,
      group: "vercel",
    },
    {
      key: "VERCEL_TEAM_ID",
      set: set("VERCEL_TEAM_ID"),
      required: false,
      group: "vercel",
    },
    {
      key: "VERCEL_DEPLOY_HOOK_URL",
      set: set("VERCEL_DEPLOY_HOOK_URL"),
      required: false,
      group: "vercel",
    },
    {
      key: "VERCEL_PROJECT_ID",
      set: set("VERCEL_PROJECT_ID") || set("VERCEL_PROJECT_NAME"),
      required: false,
      group: "vercel",
    },
  ];

  for (const c of checks) {
    if (/SECRET|API_KEY|TOKEN|PASSWORD|DATABASE_URL|PRICE_|ANON_KEY|SERVICE_ROLE/i.test(c.key)) {
      c.fingerprint = secretFingerprint(envVal(c.key)).fingerprint;
    }
  }

  const deployOk =
    set("VERCEL_DEPLOY_HOOK_URL") ||
    (set("VERCEL_TOKEN") &&
      (set("VERCEL_PROJECT_ID") || set("VERCEL_PROJECT_NAME")));

  const missingRequired = checks
    .filter((c) => c.required && !c.set)
    .map((c) => c.key);

  if (!deployOk) {
    missingRequired.push("VERCEL_TOKEN+VERCEL_PROJECT_ID|VERCEL_DEPLOY_HOOK_URL");
  }

  return {
    ready: missingRequired.length === 0,
    demoPipeline,
    authProvider,
    checks: checks.map((c) =>
      c.key === "DEMO_PIPELINE"
        ? { ...c, set: demoPipeline, note: `value=${demoPipeline}` }
        : c,
    ),
    missingRequired,
  };
}
