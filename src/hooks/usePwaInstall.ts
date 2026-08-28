import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

/** Chrome/Edge beforeinstallprompt — not in standard lib yet */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  // iOS Safari
  const ios =
    "standalone" in navigator &&
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return mq || ios;
}

export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    setInstalled(isStandalone());
    setIsIos(/iPhone|iPad|iPod/i.test(navigator.userAgent));

    const onBip = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setDeferred(e);
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
      toast.success("Cozy nainštalované");
    };

    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const canInstall = !installed && deferred !== null;

  const promptInstall = useCallback(async () => {
    if (!deferred) {
      if (isIos) {
        toast.message("Pridať na plochu", {
          description: "Share → Add to Home Screen",
        });
      }
      return false;
    }
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    if (choice.outcome === "accepted") {
      setInstalled(true);
      return true;
    }
    toast.message("Inštalácia zrušená");
    return false;
  }, [deferred, isIos]);

  return {
    canInstall,
    installed,
    isIos,
    promptInstall,
    showIosHint: isIos && !installed,
  };
}

/** Register SW only in production — never break Vite HMR */
export function registerServiceWorker(): void {
  if (typeof window === "undefined") return;
  if (!import.meta.env.PROD) return;
  if (!("serviceWorker" in navigator)) return;

  void navigator.serviceWorker
    .register("/sw.js", { scope: "/" })
    .then((reg) => {
      reg.addEventListener("updatefound", () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            toast.message("Nová verzia Cozy je pripravená", {
              action: {
                label: "Obnoviť",
                onClick: () => {
                  worker.postMessage("SKIP_WAITING");
                  window.location.reload();
                },
              },
            });
          }
        });
      });
    })
    .catch(() => {
      // silent — PWA is progressive enhancement
    });
}
