#!/usr/bin/env node
// sync-install-doc.js — keep the install guide's embedded hook scripts in sync
// with the canonical files under hooks/.
//
// Canonical source of truth: hooks/*.sh
// Generated artifact:        public/orchestration/orchestration_hook_install.md
//
// Modes:
//   --write    (default) inject hooks/*.sh into the doc's fenced blocks
//   --check    verify the doc matches hooks/*.sh; exit 1 on drift (for CI)
//   --extract  bootstrap: write hooks/*.sh FROM the doc's fenced blocks
//
// Zero dependencies — Node built-ins only.

import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = join(ROOT, "public/orchestration/orchestration_hook_install.md");
const HOOKS_DIR = join(ROOT, "hooks");

// Hook files, in the order their blocks appear in the doc.
const HOOKS = ["classify.sh", "maintain.sh", "guard-explore.sh", "rehydrate.sh"];

// Locate the ```bash fenced block that follows the heading referencing the hook.
// Heading form in the doc: ### `~/.claude/hooks/<name>`
function locateBlock(doc, name) {
  const headingIdx = doc.indexOf(`\`~/.claude/hooks/${name}\``);
  if (headingIdx === -1) throw new Error(`heading for ${name} not found in doc`);
  const fenceOpen = doc.indexOf("```bash", headingIdx);
  if (fenceOpen === -1) throw new Error(`opening fence for ${name} not found`);
  const bodyStart = doc.indexOf("\n", fenceOpen) + 1;
  const fenceClose = doc.indexOf("\n```", bodyStart);
  if (fenceClose === -1) throw new Error(`closing fence for ${name} not found`);
  // body excludes the trailing newline before the closing fence
  return { bodyStart, bodyEnd: fenceClose + 1, body: doc.slice(bodyStart, fenceClose + 1) };
}

const mode = process.argv[2] || "--write";

if (mode === "--extract") {
  const doc = readFileSync(DOC, "utf8");
  mkdirSync(HOOKS_DIR, { recursive: true });
  for (const name of HOOKS) {
    const { body } = locateBlock(doc, name);
    const path = join(HOOKS_DIR, name);
    writeFileSync(path, body);
    chmodSync(path, 0o755);
    console.log(`extracted ${name} (${body.length} bytes)`);
  }
  process.exit(0);
}

// --write and --check both render the doc from the canonical hook files.
let doc = readFileSync(DOC, "utf8");
let rendered = doc;
const drifted = [];

// Rebuild from the end so earlier offsets stay valid as we splice.
const blocks = HOOKS.map((name) => ({ name, ...locateBlock(rendered, name) }));
for (let i = blocks.length - 1; i >= 0; i--) {
  const { name, bodyStart, bodyEnd, body } = blocks[i];
  const canonical = readFileSync(join(HOOKS_DIR, name), "utf8");
  if (body !== canonical) drifted.push(name);
  rendered = rendered.slice(0, bodyStart) + canonical + rendered.slice(bodyEnd);
}

if (mode === "--check") {
  if (drifted.length) {
    console.error(`DRIFT: install doc out of sync with hooks/ for: ${drifted.join(", ")}`);
    console.error(`Fix with: npm run hooks:sync`);
    process.exit(1);
  }
  console.log("install doc in sync with hooks/");
  process.exit(0);
}

// --write
if (rendered !== doc) {
  writeFileSync(DOC, rendered);
  console.log(`synced install doc from hooks/ (${drifted.join(", ") || "no changes"})`);
} else {
  console.log("install doc already in sync");
}
