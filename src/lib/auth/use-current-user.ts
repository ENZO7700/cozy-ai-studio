import { useEffect, useState } from "react";
import { authClient } from "./client";
import { resolveAuthProvider, authEnabledResolved } from "./mode";
import {
  getSupabaseBrowser,
  mapSupabaseUser,
  type SupabaseAppUser,
} from "./supabase-browser";

export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  isDevFallback: boolean;
};

export const DEV_USER: AppUser = {
  id: "dev-user",
  displayName: "Dev User",
  primaryEmail: "dev@example.com",
  profileImageUrl: null,
  isDevFallback: true,
};

export type CurrentUserState = {
  user: AppUser | null;
  isPending: boolean;
};

export const authEnabled = authEnabledResolved("client");

export function useCurrentUserState(): CurrentUserState {
  const provider = resolveAuthProvider("client");

  // Always call hooks (stable order) — auth-off short-circuits after.
  const better = authClient.useSession();
  const [sbUser, setSbUser] = useState<AppUser | null>(null);
  const [sbPending, setSbPending] = useState(provider === "supabase");

  useEffect(() => {
    if (provider !== "supabase") {
      setSbPending(false);
      setSbUser(null);
      return;
    }
    const sb = getSupabaseBrowser();
    if (!sb) {
      setSbPending(false);
      setSbUser(null);
      return;
    }
    let cancelled = false;
    setSbPending(true);
    void sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const u = data.session?.user;
      setSbUser(
        u
          ? {
              ...mapSupabaseUser(u),
              isDevFallback: false,
            }
          : null,
      );
      setSbPending(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      setSbUser(
        u
          ? {
              ...mapSupabaseUser(u as Parameters<typeof mapSupabaseUser>[0]),
              isDevFallback: false,
            }
          : null,
      );
      setSbPending(false);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [provider]);

  if (provider === "none") {
    return { user: DEV_USER, isPending: false };
  }

  if (provider === "supabase") {
    return { user: sbUser, isPending: sbPending };
  }

  const user = better.data?.user;
  return {
    user: user
      ? {
          id: user.id,
          displayName: user.name ?? null,
          primaryEmail: user.email ?? null,
          profileImageUrl: user.image ?? null,
          isDevFallback: false,
        }
      : null,
    isPending: better.isPending,
  };
}

export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}

export type { SupabaseAppUser };
