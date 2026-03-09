#!/usr/bin/env node

// agentic-symbols v0.0.1
// Single-file bundle — generate a symbol index for a JS/TS/Python project
// Zero dependencies — uses only built-in Node.js modules
//
// Usage:
//   node symbols.js [path]

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

function getGitSha(dir) {
  try { return execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim(); }
  catch { return 'unknown'; }
}

// ── Config ──

const KIND = {
  COMPONENT: "Components",
  FUNCTION: "Functions",
  CLASS: "Classes",
  HOOK: "Hooks",
  TYPE: "Types",
  CONSTANT: "Constants",
};

const JS_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts"];
const PY_EXTENSIONS = [".py"];
const CS_EXTENSIONS = [".cs"];
const ALL_EXTENSIONS = [...JS_EXTENSIONS, ...PY_EXTENSIONS, ...CS_EXTENSIONS];
const SKIP_DIRECTORIES = new Set([
  "node_modules", "dist", ".git", "target", "build", ".next", ".turbo",
  "out", "coverage", ".cache", "__pycache__", ".venv", "venv", ".idea", ".vscode",
  "bin", "obj",
]);

// ── Walker ──

function collectFiles(dir, rootDir = dir, files = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return files; }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name) && !entry.name.startsWith(".")) {
        collectFiles(fullPath, rootDir, files);
      }
    } else if (entry.isFile() && ALL_EXTENSIONS.some(ext => fullPath.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

// ── JS/TS extraction ──

function extractJS(code, filePath) {
  const lines = code.split("\n");
  const symbols = [];
  const isPascalCase = (n) => /^[A-Z][a-zA-Z0-9]*$/.test(n);
  const isHook = (n) => /^use[A-Z]/.test(n);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;
    const lineNum = i + 1;

    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;

    const isExported = trimmed.startsWith("export ");
    const isDefault = trimmed.includes("export default ");
    const exp = isDefault ? "default" : isExported ? "named" : "";

    // Interface
    const ifaceMatch = trimmed.match(/^(?:export\s+)?(?:declare\s+)?interface\s+(\w+)/);
    if (ifaceMatch && indent === 0) {
      symbols.push({ name: ifaceMatch[1], kind: KIND.TYPE, line: lineNum, exp });
      continue;
    }

    // Type alias
    const typeMatch = trimmed.match(/^(?:export\s+)?(?:declare\s+)?type\s+(\w+)\s*[=<]/);
    if (typeMatch && indent === 0) {
      symbols.push({ name: typeMatch[1], kind: KIND.TYPE, line: lineNum, exp });
      continue;
    }

    // Class
    const classMatch = trimmed.match(/^(?:export\s+)?(?:export\s+default\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch && indent === 0) {
      symbols.push({ name: classMatch[1], kind: KIND.CLASS, line: lineNum, exp });
      continue;
    }

    // Function declaration
    const funcMatch = trimmed.match(/^(?:export\s+)?(?:export\s+default\s+)?(?:async\s+)?function\s+(\w+)/);
    if (funcMatch && indent === 0) {
      const name = funcMatch[1];
      const kind = isPascalCase(name) ? KIND.COMPONENT : isHook(name) ? KIND.HOOK : KIND.FUNCTION;
      symbols.push({ name, kind, line: lineNum, exp });
      continue;
    }

    // Variable declarations
    const varMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(.*)/);
    if (varMatch && indent === 0) {
      const name = varMatch[1];
      const rhs = varMatch[2].trim();

      const isArrow = /^(?:async\s+)?\(/.test(rhs) || /^(?:async\s+)?\w+\s*=>/.test(rhs);
      const isFuncExpr = /^(?:async\s+)?function/.test(rhs);
      const isHOC = /^(?:React\.)?(memo|forwardRef|lazy)\s*\(/.test(rhs);

      if (isArrow || isFuncExpr) {
        const kind = isPascalCase(name) ? KIND.COMPONENT : isHook(name) ? KIND.HOOK : KIND.FUNCTION;
        symbols.push({ name, kind, line: lineNum, exp });
      } else if (isHOC) {
        symbols.push({ name, kind: KIND.COMPONENT, line: lineNum, exp });
      } else {
        symbols.push({ name, kind: KIND.CONSTANT, line: lineNum, exp });
      }
      continue;
    }
  }

  return symbols;
}

// ── Python extraction ──

function extractPython(code) {
  const lines = code.split("\n");
  const symbols = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;
    const lineNum = i + 1;

    if (!trimmed || trimmed.startsWith("#")) continue;

    // Class
    const classMatch = trimmed.match(/^class\s+(\w+)/);
    if (classMatch && indent === 0) {
      symbols.push({ name: classMatch[1], kind: KIND.CLASS, line: lineNum, exp: "" });
      continue;
    }

    // Function
    const funcMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)/);
    if (funcMatch && indent === 0) {
      symbols.push({ name: funcMatch[1], kind: KIND.FUNCTION, line: lineNum, exp: "" });
      continue;
    }

    // Top-level constants (UPPER_CASE)
    const constMatch = trimmed.match(/^([A-Z][A-Z_0-9]+)\s*=/);
    if (constMatch && indent === 0) {
      symbols.push({ name: constMatch[1], kind: KIND.CONSTANT, line: lineNum, exp: "" });
      continue;
    }
  }

  return symbols;
}

// ── C# extraction ──

function extractCSharp(code) {
  const lines = code.split("\n");
  const symbols = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const lineNum = i + 1;

    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;

    // Enum
    const enumMatch = trimmed.match(/^(?:public|private|protected|internal)?\s*enum\s+(\w+)/);
    if (enumMatch) {
      symbols.push({ name: enumMatch[1], kind: KIND.TYPE, line: lineNum, exp: "" });
      continue;
    }

    // Interface
    const ifaceMatch = trimmed.match(/^(?:public|private|protected|internal)?\s*(?:partial\s+)?interface\s+(\w+)/);
    if (ifaceMatch) {
      symbols.push({ name: ifaceMatch[1], kind: KIND.TYPE, line: lineNum, exp: "" });
      continue;
    }

    // Class / struct / record
    const classMatch = trimmed.match(/^(?:public|private|protected|internal)?\s*(?:static\s+)?(?:abstract\s+)?(?:sealed\s+)?(?:partial\s+)?(?:class|struct|record)\s+(\w+)/);
    if (classMatch) {
      symbols.push({ name: classMatch[1], kind: KIND.CLASS, line: lineNum, exp: "" });
      continue;
    }

    // Methods (top-level-ish: public/private/protected/internal + return type + name + parens)
    const methodMatch = trimmed.match(/^(?:public|private|protected|internal)\s+(?:static\s+)?(?:async\s+)?(?:virtual\s+)?(?:override\s+)?(?:abstract\s+)?(?:[\w<>\[\]?,\s]+?)\s+(\w+)\s*\(/);
    if (methodMatch && !trimmed.includes(" class ") && !trimmed.includes(" interface ") && !trimmed.includes(" struct ") && !trimmed.includes(" enum ")) {
      const name = methodMatch[1];
      if (name !== "get" && name !== "set" && name !== "if" && name !== "for" && name !== "while" && name !== "switch" && name !== "catch" && name !== "using" && name !== "return" && name !== "new") {
        symbols.push({ name, kind: KIND.FUNCTION, line: lineNum, exp: "" });
        continue;
      }
    }

    // Constants
    const constMatch = trimmed.match(/^(?:public|private|protected|internal)?\s*(?:static\s+)?(?:readonly\s+)?const\s+\w+\s+(\w+)/);
    if (constMatch) {
      symbols.push({ name: constMatch[1], kind: KIND.CONSTANT, line: lineNum, exp: "" });
      continue;
    }
  }

  return symbols;
}

// ── Main ──

function main() {
  const args = process.argv.slice(2);
  let targetPath = process.cwd();

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      console.log("Usage: node symbols.js [path]\n\nGenerate a symbol index for a JS/TS/Python/C# project.\nZero dependencies — only requires Node.js.");
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      targetPath = arg;
    }
  }

  const root = path.resolve(targetPath);
  const projectName = path.basename(root);
  const files = collectFiles(root);
  const allSymbols = [];

  for (const fp of files) {
    let content;
    try { content = fs.readFileSync(fp, "utf-8"); }
    catch { continue; }

    const relPath = path.relative(root, fp);
    const isPython = fp.endsWith(".py");
    const isCSharp = fp.endsWith(".cs");
    const extracted = isCSharp ? extractCSharp(content) : isPython ? extractPython(content) : extractJS(content, fp);

    for (const sym of extracted) {
      allSymbols.push({ ...sym, file: relPath });
    }
  }

  // Group by kind
  const groups = {};
  for (const kind of Object.values(KIND)) groups[kind] = [];
  for (const sym of allSymbols) groups[sym.kind].push(sym);

  // Sort each group alphabetically
  for (const arr of Object.values(groups)) arr.sort((a, b) => a.name.localeCompare(b.name));

  // Build output
  const now = new Date();
  const ts = now.toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
  const fileTs = ts.replace(/[: ]/g, "-").slice(0, 19);

  const lines = [];
  lines.push(`# Symbol Index — ${projectName}`);
  lines.push(`Generated: ${ts} | Files: ${files.length} | Symbols: ${allSymbols.length} | git-sha: ${getGitSha(root)}`);
  lines.push("");

  for (const [kind, syms] of Object.entries(groups)) {
    if (syms.length === 0) continue;
    lines.push(`## ${kind}`);
    lines.push("| Symbol | File | Line | Export |");
    lines.push("|--------|------|------|--------|");
    for (const s of syms) {
      lines.push(`| ${s.name} | ${s.file} | ${s.line} | ${s.exp} |`);
    }
    lines.push("");
  }

  const outDir = path.join(root, '.orchestration', 'tools');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `symbols_${projectName}_${fileTs}.md`);
  fs.writeFileSync(outFile, lines.join("\n"), "utf-8");
  console.log(`✓ Symbol index written to ${outFile}`);
  console.log(`  Files scanned: ${files.length} | Symbols found: ${allSymbols.length}`);
}

main();
