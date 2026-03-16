#!/usr/bin/env node
const { readFileSync, writeFileSync } = require("fs");
const { createHash } = require("crypto");
const { join } = require("path");

const dir = __dirname;
const scripts = ["compaction.js", "dep-graph.js", "symbols.js"];

const manifest = {};
for (const name of scripts) {
  const content = readFileSync(join(dir, name));
  manifest[name] = { sha256: createHash("sha256").update(content).digest("hex") };
}

writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log("manifest.json written");
