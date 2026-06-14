#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const scripts = ["compaction.js", "dep-graph.js", "symbols.js", "parse-utils.js"];

const manifest = {};
for (const name of scripts) {
  const content = readFileSync(join(dir, name));
  manifest[name] = { sha256: createHash("sha256").update(content).digest("hex") };
}

const manifestPath = join(dir, "manifest.json");
const rendered = JSON.stringify(manifest, null, 2) + "\n";

if (process.argv.includes("--check")) {
  const current = readFileSync(manifestPath, "utf8");
  if (current !== rendered) {
    console.error("DRIFT: manifest.json is stale. Regenerate with: npm run manifest");
    process.exit(1);
  }
  console.log("manifest.json in sync with tool sources");
} else {
  writeFileSync(manifestPath, rendered);
  console.log("manifest.json written");
}
