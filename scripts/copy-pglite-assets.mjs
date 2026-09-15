#!/usr/bin/env node
/**
 * Nitro/Vercel rewrite `@electric-sql/pglite` to `_libs/electric-sql__pglite.mjs`
 * but drop the WASM/data sidecars that `new URL("./pglite.data", import.meta.url)`
 * expects next to that file. Copy them after `vite build` so `npm run preview`
 * can boot PGLite.
 */
import { copyFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@electric-sql/pglite/dist");
const dests = [join(root, ".vercel/output/functions/__server.func/_libs")];
const files = ["pglite.data", "pglite.wasm", "initdb.wasm"];

let copied = 0;
for (const dest of dests) {
  if (!existsSync(dest)) continue;
  for (const file of files) {
    const from = join(src, file);
    if (!existsSync(from)) continue;
    copyFileSync(from, join(dest, file));
    copied += 1;
  }
}

if (copied === 0) {
  console.warn("[pglite-assets] no destination found — skip (dev-only?)");
} else {
  console.log(`[pglite-assets] copied ${copied} sidecar files`);
}
