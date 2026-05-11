#!/usr/bin/env node

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const entryPath = resolve(currentDir, "../dist/index.js");

if (!existsSync(entryPath)) {
  console.error("Build output is missing. Run `npm run build` first.");
  process.exit(1);
}

const { run } = await import("../dist/index.js");
process.exit(await run(process.argv.slice(2)));
