#!/usr/bin/env node
/**
 * Fail the build if Node's createRequire leaked into browser JS.
 * Scans Vite/Nitro client asset trees only (not server bundles).
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join } from "node:path";

const CLIENT_ROOTS = [
  "dist/client",
  "dist/assets",
  ".vercel/output/static",
  ".vercel/output/static/assets",
];

const SKIP_DIR = new Set(["server", "node_modules", "nitro"]);
const JS_EXT = new Set([".js", ".mjs", ".cjs"]);

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    if (SKIP_DIR.has(name)) continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, acc);
    else if (JS_EXT.has(extname(name))) acc.push(p);
  }
  return acc;
}

const seen = new Set();
const files = [];
for (const root of CLIENT_ROOTS) {
  for (const f of walk(root)) {
    if (seen.has(f)) continue;
    seen.add(f);
    files.push(f);
  }
}

const hits = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (text.includes("createRequire")) hits.push(file);
}

if (hits.length) {
  console.error("assert-no-createRequire: FAIL — createRequire in client JS:");
  for (const f of hits) console.error("  " + f);
  process.exit(1);
}

console.log(
  `assert-no-createRequire: ok (0 matches in ${files.length} client JS files)`,
);
