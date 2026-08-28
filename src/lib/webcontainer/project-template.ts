/**
 * Minimal Vite + React project scaffolded inside WebContainer.
 */

export const WC_PACKAGE_JSON = JSON.stringify(
  {
    name: "cai-preview",
    private: true,
    version: "0.0.0",
    type: "module",
    scripts: {
      dev: "vite --host 0.0.0.0 --port 5173 --strictPort",
      build: "vite build",
      preview: "vite preview --host 0.0.0.0 --port 5173",
    },
    dependencies: {
      react: "^19.0.0",
      "react-dom": "^19.0.0",
    },
    devDependencies: {
      "@vitejs/plugin-react": "^4.3.4",
      vite: "^6.0.0",
      typescript: "^5.7.0",
    },
  },
  null,
  2,
);

export const WC_VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
});
`;

export const WC_INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>CAI Preview</title>
    <style>
      :root { color-scheme: light dark; font-family: Inter, system-ui, sans-serif; }
      body { margin: 0; height: 100dvh; max-height: 100dvh; overflow: hidden; background: #faf7f2; color: #1a1c20; }
      #root { height: 100dvh; max-height: 100dvh; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

export const WC_MAIN_TSX = `import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
`;

export const WC_APP_DEFAULT = `export default function App() {
  // Locked 100vh screen — no page scroll; scale with viewport
  return (
    <main
      style={{
        boxSizing: "border-box",
        height: "100dvh",
        maxHeight: "100dvh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: "clamp(12px, 2.5vh, 24px)",
        fontFamily: "system-ui, sans-serif",
        background: "#faf7f2",
        color: "#1a1c20",
      }}
    >
      <p style={{ letterSpacing: "0.2em", fontSize: "clamp(10px, 1.6vh, 12px)", opacity: 0.6, margin: 0 }}>
        CAI
      </p>
      <h1 style={{ marginTop: "clamp(4px, 1vh, 8px)", fontSize: "clamp(1.25rem, 4vh, 2rem)", marginBottom: 0 }}>
        Live Preview
      </h1>
      <p style={{ opacity: 0.75, fontSize: "clamp(0.8rem, 2vh, 1rem)", marginTop: "clamp(6px, 1.2vh, 12px)" }}>
        Run agents and Accept a diff — this WebContainer will hot-reload your app.
      </p>
    </main>
  );
}
`;

export const WC_TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: "ES2022",
      useDefineForClassFields: true,
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      module: "ESNext",
      skipLibCheck: true,
      moduleResolution: "bundler",
      allowImportingTsExtensions: true,
      isolatedModules: true,
      moduleDetection: "force",
      noEmit: true,
      jsx: "react-jsx",
      strict: true,
    },
    include: ["src"],
  },
  null,
  2,
);

/** Flat path → contents for the WC filesystem */
export type FlatFiles = Record<string, string>;

export function buildBaseProjectFiles(
  appSource?: string,
  extra?: FlatFiles,
): FlatFiles {
  const files: FlatFiles = {
    "package.json": WC_PACKAGE_JSON,
    "vite.config.ts": WC_VITE_CONFIG,
    "index.html": WC_INDEX_HTML,
    "tsconfig.json": WC_TSCONFIG,
    "src/main.tsx": WC_MAIN_TSX,
    "src/App.tsx": appSource?.trim() || WC_APP_DEFAULT,
  };
  if (extra) {
    for (const [path, content] of Object.entries(extra)) {
      if (path === "package.json" || path === "vite.config.ts") continue;
      files[path.replace(/^\//, "")] = content;
    }
  }
  if (extra?.["src/App.tsx"]) files["src/App.tsx"] = extra["src/App.tsx"];
  if (extra?.["App.tsx"]) files["src/App.tsx"] = extra["App.tsx"];
  return files;
}

/** Convert flat map to WebContainer FileSystemTree */
export function toFileSystemTree(
  files: FlatFiles,
): import("@webcontainer/api").FileSystemTree {
  const tree: import("@webcontainer/api").FileSystemTree = {};

  for (const [rawPath, contents] of Object.entries(files)) {
    const parts = rawPath.split("/").filter(Boolean);
    let node = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isFile = i === parts.length - 1;
      if (isFile) {
        node[part] = { file: { contents } };
      } else {
        const existing = node[part];
        if (!existing || !("directory" in existing)) {
          node[part] = { directory: {} };
        }
        node = (node[part] as { directory: import("@webcontainer/api").FileSystemTree })
          .directory;
      }
    }
  }
  return tree;
}
