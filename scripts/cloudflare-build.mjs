import { spawnSync } from "node:child_process";
import fs from "node:fs";

function ensureEsbuild() {
  for (const script of [
    "node_modules/esbuild/install.js",
    "node_modules/@opennextjs/aws/node_modules/esbuild/install.js",
  ]) {
    if (!fs.existsSync(new URL(`../${script}`, import.meta.url))) continue;
    const install = spawnSync(process.execPath, [script], { stdio: "inherit" });
    if (install.status) process.exit(install.status ?? 1);
  }
}

ensureEsbuild();

const result = spawnSync(
  process.execPath,
  ["node_modules/@opennextjs/cloudflare/dist/cli/index.js", "build"],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
