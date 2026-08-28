/**
 * Server-only: turn G1 TSX into a self-contained Live Preview document.
 * UMD React is inlined from react-umd.generated.ts (never read from /var/task/public).
 *
 * Dynamic import("vite") — do NOT static-import vite here.
 * Static import prebundles vite into client and triggers:
 *   Identifier '__vite__injectQuery' has already been declared
 */

import { REACT_DOM_UMD, REACT_UMD } from "./react-umd.generated";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isBrokenPreviewHtml(html: string | null | undefined): boolean {
  if (!html?.trim()) return true;
  // Only treat as broken when the ERROR pre is the payload (not the boot helper script id)
  if (/Live Preview transform failed/i.test(html)) return true;
  if (/ENOENT:.*preview-runtime/i.test(html)) return true;
  if (/\/var\/task\/public\/preview-runtime/i.test(html)) return true;
  if (/Preview runtime UMD missing/i.test(html)) return true;
  // Error pre as only content (no React UMD)
  if (
    /id=["']cosy-boot-error["']/.test(html) &&
    !/@license React/i.test(html) &&
    !/__COSY_APP_JS__/i.test(html)
  ) {
    return true;
  }
  return false;
}

/** Pull App.tsx content from share source / G1 JSON dumps. */
export function extractTsxFromStoredSource(
  source: string | null | undefined,
): string | null {
  if (!source?.trim()) return null;
  let s = source.trim();
  const fence = s.match(/```(?:json|tsx|jsx|ts|js)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();

  // Prefer files[].content even when JSON has raw newlines (invalid JSON from G1)
  const fromFiles = extractContentNearPath(s, "src/App.tsx")
    || extractContentNearPath(s, "App.tsx")
    || extractFirstContentField(s);
  if (fromFiles?.trim()) return fromFiles.trim();

  if (s.startsWith("{")) {
    try {
      const j = JSON.parse(s) as {
        code?: string;
        files?: Array<{ path?: string; content?: string }>;
      };
      if (typeof j.code === "string" && j.code.trim() && !j.code.trim().startsWith("{")) {
        return j.code.trim();
      }
      const files = Array.isArray(j.files) ? j.files : [];
      const primary =
        files.find((f) => f.path === "src/App.tsx") ||
        files.find((f) => (f.path || "").endsWith("App.tsx")) ||
        files[0];
      if (primary?.content?.trim()) return primary.content.trim();
    } catch {
      /* salvaged above */
    }
  }

  // Raw TSX only
  if (/^\s*\{/.test(s) && /"files"\s*:|"primaryPath"\s*:|"title"\s*:/.test(s)) {
    return null;
  }
  if (
    /export\s+default/.test(s) ||
    /function\s+App\b/.test(s) ||
    /const\s+App\s*=/.test(s)
  ) {
    return s;
  }
  return null;
}

/** Read a JSON string value allowing raw newlines (invalid JSON from models). */
function readLooseJsonString(s: string, startIdx: number): string | null {
  if (s[startIdx] !== '"') return null;
  let pos = startIdx + 1;
  let out = "";
  while (pos < s.length) {
    const c = s[pos];
    if (c === "\\") {
      const n = s[pos + 1];
      if (n === "n") out += "\n";
      else if (n === "t") out += "\t";
      else if (n === "r") out += "\r";
      else if (n === '"') out += '"';
      else if (n === "\\") out += "\\";
      else if (n === "u" && pos + 5 < s.length) {
        out += String.fromCharCode(parseInt(s.slice(pos + 2, pos + 6), 16));
        pos += 6;
        continue;
      } else if (n != null) out += n;
      pos += 2;
      continue;
    }
    if (c === '"') {
      // End of string if followed by , or } (with optional whitespace)
      const after = s.slice(pos + 1, pos + 12);
      if (/^\s*[,}]/.test(after)) break;
      // trailing " before newline + }
      if (/^\s*\n\s*[,}]/.test(s.slice(pos + 1, pos + 20))) break;
      break;
    }
    out += c;
    pos += 1;
  }
  return out;
}

function extractFirstContentField(s: string): string | null {
  const key = '"content"';
  let from = 0;
  while (from < s.length) {
    const i = s.indexOf(key, from);
    if (i < 0) return null;
    const colon = s.indexOf(":", i + key.length);
    if (colon < 0) return null;
    let j = colon + 1;
    while (j < s.length && /\s/.test(s[j]!)) j++;
    const val = readLooseJsonString(s, j);
    if (val && (val.includes("export default") || val.includes("function App") || val.includes("React"))) {
      return val;
    }
    from = i + key.length;
  }
  return null;
}

function extractContentNearPath(s: string, pathHint: string): string | null {
  const pathIdx = s.indexOf(`"path"`);
  if (pathIdx < 0) return extractFirstContentField(s);
  // Find pathHint then nearest content after it within ~200 chars before / 5k after
  let searchFrom = 0;
  while (searchFrom < s.length) {
    const p = s.indexOf(pathHint, searchFrom);
    if (p < 0) break;
    const window = s.slice(Math.max(0, p - 80), p + 8000);
    const cKey = window.indexOf('"content"');
    if (cKey >= 0) {
      const abs = Math.max(0, p - 80) + cKey;
      let j = s.indexOf(":", abs) + 1;
      while (j < s.length && /\s/.test(s[j]!)) j++;
      const val = readLooseJsonString(s, j);
      if (val?.trim()) return val;
    }
    searchFrom = p + pathHint.length;
  }
  return null;
}

async function transpileTsxToIife(code: string): Promise<string> {
  let src = code;
  // Template CSS: <style>{`...`}</style> → dangerouslySetInnerHTML (valid JSX)
  src = src.replace(
    /<style>\{\s*`([\s\S]*?)`\s*\}<\/style>/g,
    (_m, css) =>
      `<style dangerouslySetInnerHTML={{__html: ${JSON.stringify(String(css))} }} />`,
  );
  // Bare CSS children are invalid JSX ( `{` starts an expression )
  src = src.replace(
    /<style>(?!\{\{|[^<]*dangerouslySetInnerHTML)([\s\S]*?)<\/style>/g,
    (_m, css) => {
      const body = String(css).trim();
      if (!body || body.startsWith("{")) return _m;
      return `<style dangerouslySetInnerHTML={{__html: ${JSON.stringify(body)} }} />`;
    },
  );
  src = src.replace(/^\s*import\s+.*?from\s+['"]react['"];?\s*$/gm, "");
  src = src.replace(/^\s*import\s+.*?from\s+['"]react-dom.*['"];?\s*$/gm, "");

  // Dynamic import — server-only, avoids vite client prebundle / injectQuery clash
  const { transformWithOxc } = await import("vite");
  const { code: js } = await transformWithOxc(src, "App.tsx", {
    lang: "tsx",
    jsx: { runtime: "classic" },
  });
  let out = js.replace(/^\uFEFF/, "");
  out = out.replace(
    /^\s*import\s+[\s\S]*?from\s+["'][^"']+["']\s*;?\s*$/gm,
    "",
  );
  out = out.replace(/^\s*import\s+["'][^"']+["']\s*;?\s*$/gm, "");
  out = out.replace(
    /\bexport\s+default\s+function\s+([A-Za-z_$][\w$]*)/g,
    "function $1",
  );
  out = out.replace(/\bexport\s+default\s+/g, "var __CosyDefault = ");
  out = out.replace(/\bexport\s+(async\s+)?function\s+/g, "$1function ");
  out = out.replace(/\bexport\s+(const|let|var)\s+/g, "$1 ");
  out = out.replace(/^\s*export\s*\{[^}]*\}\s*;?\s*$/gm, "");
  // FC types may remain as annotations stripped? keep as-is; classic JSX handles
  out = out.replace(/:\s*React\.FC(?:<[^>]*>)?/g, "");
  out = out.replace(/:\s*React\.ReactNode/g, "");
  const prelude =
    "var useState = React.useState, useEffect = React.useEffect, useMemo = React.useMemo, useRef = React.useRef, useCallback = React.useCallback, useContext = React.useContext, useReducer = React.useReducer, useId = React.useId, Fragment = React.Fragment;\n";
  return prelude + out;
}

export async function buildPreviewHtml(
  title: string,
  code: string,
): Promise<string> {
  const safeTitle = escapeHtml(title || "Preview");
  const trimmed = code.trim();
  if (
    /^<!DOCTYPE html>/i.test(trimmed) ||
    (/^<html[\s>]/i.test(trimmed) && /<\/html>/i.test(trimmed))
  ) {
    return trimmed;
  }

  try {
    if (!REACT_UMD || !REACT_DOM_UMD) {
      throw new Error("Preview runtime UMD not embedded in server bundle");
    }
    const js = await transpileTsxToIife(code);
    const jsPayload = JSON.stringify(js);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<title>${safeTitle}</title>
<style>
  html, body, #root { margin: 0; min-height: 100%; }
  body {
    font-family: Inter, system-ui, sans-serif;
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    padding-left: env(safe-area-inset-left, 0px);
    padding-right: env(safe-area-inset-right, 0px);
  }
  #cosy-boot-error {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    line-height: 1.5;
    padding: 20px;
    margin: 0;
    color: #7f1d1d;
    background: #fef2f2;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style>
<script>${REACT_UMD}</script>
<script>${REACT_DOM_UMD}</script>
</head>
<body>
<div id="root"></div>
<script>
window.__COSY_APP_JS__ = ${jsPayload};
(function () {
  function fail(err) {
    var el = document.getElementById("root");
    var pre = document.createElement("pre");
    pre.id = "cosy-boot-error";
    pre.textContent = "Live Preview failed to boot:\\n" + (err && err.message ? err.message : String(err));
    el.innerHTML = "";
    el.appendChild(pre);
    console.error("[cosy-preview]", err);
  }
  try {
    if (!window.React || !window.ReactDOM) throw new Error("React UMD missing");
    var src = window.__COSY_APP_JS__ || "";
    var runner = new Function(
      "React",
      "ReactDOM",
      src +
        ";\\n" +
        "var Comp = (typeof App !== 'undefined' ? App : (typeof __CosyDefault !== 'undefined' ? __CosyDefault : null));" +
        "if (!Comp) throw new Error('No default App component in generated code.');" +
        "var root = ReactDOM.createRoot(document.getElementById('root'));" +
        "root.render(React.createElement(Comp));"
    );
    runner(window.React, window.ReactDOM);
  } catch (e) {
    fail(e);
  }
})();
</script>
</body>
</html>`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
<title>${safeTitle}</title>
</head><body>
<pre id="cosy-boot-error" style="padding:20px;color:#7f1d1d;background:#fef2f2;white-space:pre-wrap">Live Preview transform failed:
${escapeHtml(msg)}

Fix: G1 must output a self-contained default-export React component with a style tag (no Tailwind-only classes).</pre>
</body></html>`;
  }
}

/** Rebuild broken share HTML from stored source; returns null if cannot. */
export async function healPreviewHtmlFromSource(opts: {
  title?: string;
  html: string;
  sourceCode?: string | null;
}): Promise<string | null> {
  if (!isBrokenPreviewHtml(opts.html)) return null;
  const tsx = extractTsxFromStoredSource(opts.sourceCode);
  if (!tsx) return null;
  const next = await buildPreviewHtml(opts.title || "Preview", tsx);
  if (isBrokenPreviewHtml(next)) return null;
  return next;
}
