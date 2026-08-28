import { useEffect, type ReactNode } from "react";
import { installSafeAreaListener } from "@/lib/safe-area";
import { registerServiceWorker } from "@/hooks/usePwaInstall";
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import appCss from "@/styles.css?url";

/** Inline: silver (dark) default before React hydrates; respect saved theme. */
/** Inline: raise --sat-fallback on tall iOS when env(safe-area)=0 (in-app browsers). */
const SAFE_AREA_BOOT = `(function(){try{var ua=navigator.userAgent||"";var ios=/iPhone|iPad|iPod/i.test(ua)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);if(!ios)return;var w=Math.min(screen.width,screen.height),h=Math.max(screen.width,screen.height);if(w<1||h/w<1.95)return;var d=document.createElement("div");d.style.cssText="position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top,0px)";document.documentElement.appendChild(d);var pt=parseFloat(getComputedStyle(d).paddingTop)||0;d.remove();if(pt>=20)return;var air=h/w>=2.12||w>=414;var r=document.documentElement;r.style.setProperty("--sat-fallback",air?"68px":"59px");r.style.setProperty("--sab-fallback","34px");r.setAttribute("data-safe-fallback","1");}catch(e){}})();`;

const THEME_BOOT = `(function(){try{var k="cozy-ai-studio-v1";var raw=localStorage.getItem(k);var t="dark";if(raw){var p=JSON.parse(raw);var s=p&&(p.state||p);if(s&&s.theme==="light")t="light";}var d=document.documentElement;if(t==="dark")d.classList.add("dark");else d.classList.remove("dark");}catch(e){document.documentElement.classList.add("dark");}})();`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      {
        title: "Cozy AI Studio — Brief → preview → share",
      },
      {
        name: "description",
        content:
          "Speed Studio: brief to live preview with multi-agent pipeline, HitL approvals, and free daily caps. No fake Kernel or Figma product claims.",
      },
      { name: "application-name", content: "Cozy AI Studio" },
      { name: "apple-mobile-web-app-title", content: "Cozy Studio" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      // Silver gunmetal default
      { name: "theme-color", content: "#3a3e46" },
      { name: "msapplication-TileColor", content: "#3a3e46" },
      { name: "msapplication-TileImage", content: "/android-chrome-192x192.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&family=Inter:wght@400;500;600&family=Playfair+Display:wght@600;700&display=swap",
        crossOrigin: "anonymous",
      },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
      { rel: "icon", type: "image/png", sizes: "48x48", href: "/favicon-48x48.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      {
        rel: "icon",
        type: "image/png",
        sizes: "192x192",
        href: "/android-chrome-192x192.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "512x512",
        href: "/android-chrome-512x512.png",
      },
      { rel: "manifest", href: "/site.webmanifest" },
      { rel: "mask-icon", href: "/favicon-32x32.png", color: "#7090b5" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  useEffect(() => {
    installSafeAreaListener();
    registerServiceWorker();
  }, []);
  return (
    <RootDocument>
      <Outlet />
      <Toaster
        position="bottom-right"
        toastOptions={{
          className: "font-sans text-sm",
          style: {
            background: "var(--color-card)",
            color: "var(--color-foreground)",
            border: "1px solid var(--color-border)",
          },
        }}
      />
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="sk" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
        <script dangerouslySetInnerHTML={{ __html: SAFE_AREA_BOOT }} />
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
