// Build script for the Nailoong Image Swap extension.
//
// Compiles the TypeScript bundles from src/ into dist/nailoong-image-swap/,
// copies the static files in, and packages the folder as
// dist/nailoong-image-swap.zip.
//
// Everything under dist/ is generated output. Never edit it by hand;
// run `npm run build` instead.

import { spawnSync } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const outDir = `${root}dist/nailoong-image-swap`;

const entries = ["background.ts", "content.ts", "popup.ts"];

// The localhost test hook is a real switch on the user's extension, and a page
// served from localhost can fire it. Only a dev build may contain it.
const isDevBuild = process.env.NAILOONG_DEV === "1";

// dist/ is fully generated: wipe it first so stale files can never linger.
await rm(outDir, { recursive: true, force: true });
await rm(`${root}dist/nailoong-image-swap.zip`, { force: true });
await mkdir(outDir, { recursive: true });

for (const entry of entries) {
  await esbuild.build({
    entryPoints: [`${root}src/${entry}`],
    bundle: true,
    format: "esm",
    target: "es2022",
    outfile: `${outDir}/${entry.replace(".ts", ".js")}`,
    define: { __NAILOONG_DEV__: isDevBuild ? "true" : "false" },
    // Syntax minification only: it drops the branches the define above makes
    // unreachable, without renaming anything a stack trace would need.
    minifySyntax: true,
    logLevel: "info",
  });
}

// Static files that ship with the extension without being compiled. Only files
// the browser actually loads belong here: the README and the demo screenshots
// are documentation, and shipping them would add ~300 KB to every install.
const staticFiles = [
  ["manifest.json", "manifest.json"],
  ["src/popup.html", "popup.html"],
  ["src/popup.css", "popup.css"],
];

for (const [from, to] of staticFiles) {
  await cp(`${root}${from}`, `${outDir}/${to}`);
}

const zip = spawnSync("zip", ["-r", "nailoong-image-swap.zip", "nailoong-image-swap"], {
  cwd: `${root}dist`,
  stdio: "inherit",
});
if (zip.status !== 0) {
  process.exit(zip.status ?? 1);
}
