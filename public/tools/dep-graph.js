#!/usr/bin/env node

// agentic-dep-graph v0.0.1
// Single-file bundle — generate a dependency graph for a JS/TS/Python project
// Zero dependencies — uses only built-in Node.js modules
//
// Usage:
//   node dep-graph.js [path]

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, join, basename, dirname, relative, extname } from 'path';
import { stripCommentsAndStrings, detectLanguage } from './parse-utils.js';

function getGitSha(dir) {
  try { return execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim(); }
  catch { return 'unknown'; }
}

// ── Config ──

const JS_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'];
const PY_EXTENSIONS = ['.py'];
const CS_EXTENSIONS = ['.cs'];
const ALL_EXTENSIONS = [...JS_EXTENSIONS, ...PY_EXTENSIONS, ...CS_EXTENSIONS];
const SKIP_DIRECTORIES = new Set([
  'node_modules', 'dist', '.git', 'target', 'build', '.next', '.turbo',
  'out', 'coverage', '.cache', '__pycache__', '.venv', 'venv', '.idea', '.vscode',
  'bin', 'obj',
]);

// ── Walker ──

function collectFiles(dir, rootDir = dir, files = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return files; }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRECTORIES.has(entry.name) && !entry.name.startsWith('.')) {
        collectFiles(fullPath, rootDir, files);
      }
    } else if (entry.isFile() && ALL_EXTENSIONS.some(ext => fullPath.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

// ── Import extraction ──

function extractJsImports(code, filePath) {
  // Pre-pass: build a blanking map to detect if a match falls in a string/comment.
  // We run regex on original code (to capture paths) but verify each match offset
  // is real code (not blanked) by checking the cleaned version at the keyword position.
  const lang = detectLanguage(filePath || '.js');
  const cleaned = stripCommentsAndStrings(code, lang);

  function isRealAt(offset) {
    // Check that the character at `offset` in cleaned code is not blanked (not a space
    // where the original had a non-space). If original is non-space and cleaned is space,
    // it was inside a string/comment.
    if (offset >= cleaned.length) return false;
    const origCh = code[offset];
    const cleanCh = cleaned[offset];
    // If original char was non-space but cleaned is space, it's blanked
    if (origCh !== ' ' && origCh !== '\t' && cleanCh === ' ') return false;
    return true;
  }

  const local = [];
  const external = [];

  function classify(source) {
    if (source.startsWith('.') || source.startsWith('/')) local.push(source);
    else external.push(source.split('/').slice(0, source.startsWith('@') ? 2 : 1).join('/'));
  }

  // Static imports: import ... from '...'
  const importRegex = /import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(code)) !== null) {
    if (!isRealAt(match.index)) continue;
    classify(match[1]);
  }

  // Side-effect imports: import '...'
  const sideEffectRegex = /import\s+['"]([^'"]+)['"]/g;
  while ((match = sideEffectRegex.exec(code)) !== null) {
    if (!isRealAt(match.index)) continue;
    classify(match[1]);
  }

  // Dynamic imports: import('...')
  const dynamicRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynamicRegex.exec(code)) !== null) {
    if (!isRealAt(match.index)) continue;
    classify(match[1]);
  }

  // require('...')
  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(code)) !== null) {
    if (!isRealAt(match.index)) continue;
    classify(match[1]);
  }

  return { local, external };
}

function extractPyImports(code) {
  const cleaned = stripCommentsAndStrings(code, 'py');
  const local = [];
  const external = [];

  const lines = cleaned.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const trimmed = lines[li].trim();
    if (!trimmed) continue;

    // from .foo import bar  (relative)
    const fromRelative = trimmed.match(/^from\s+(\.+\w*)\s+import/);
    if (fromRelative) { local.push(fromRelative[1]); continue; }

    // from foo import bar  (absolute)
    const fromAbsolute = trimmed.match(/^from\s+([\w.]+)\s+import/);
    if (fromAbsolute) { external.push(fromAbsolute[1].split('.')[0]); continue; }

    // import foo, bar
    const importMatch = trimmed.match(/^import\s+(.+)/);
    if (importMatch) {
      const modules = importMatch[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].split('.')[0]);
      for (const mod of modules) external.push(mod);
    }
  }

  return { local, external };
}

function extractCsImports(code) {
  const external = [];

  const lines = code.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();

    // using Namespace.Sub;  or  using Alias = Namespace.Sub;
    const usingMatch = trimmed.match(/^using\s+(?:static\s+)?(?:\w+\s*=\s*)?([\w.]+)\s*;/);
    if (usingMatch) {
      external.push(usingMatch[1].split('.')[0]);
      continue;
    }

    // Stop scanning after namespace/class declaration (usings are always at the top)
    if (/^(?:namespace|class|struct|record|interface|enum)\b/.test(trimmed)) break;
    if (/^(?:public|private|protected|internal)\s+/.test(trimmed) && /\b(?:class|struct|record|interface|enum)\b/.test(trimmed)) break;
  }

  // C# doesn't have file-based local imports like JS/Python — dependencies are namespace-based
  return { local: [], external };
}

// ── Resolve local imports to file paths ──

function resolveLocalImport(importSource, fromFile, rootDir, allFilesSet) {
  const fromDir = dirname(fromFile);
  let candidate = resolve(fromDir, importSource);

  // Try exact match first
  if (allFilesSet.has(candidate)) return relative(rootDir, candidate);

  // Try adding extensions
  for (const ext of ALL_EXTENSIONS) {
    if (allFilesSet.has(candidate + ext)) return relative(rootDir, candidate + ext);
  }

  // Try as directory with index file
  for (const ext of ALL_EXTENSIONS) {
    const indexPath = join(candidate, `index${ext}`);
    if (allFilesSet.has(indexPath)) return relative(rootDir, indexPath);
  }

  return null;
}

// ── Graph building ──

function buildGraph(files, rootDir) {
  const allFilesSet = new Set(files);
  const forward = new Map();  // file -> Set of files it imports
  const reverse = new Map();  // file -> Set of files that import it
  const externals = new Map(); // file -> Set of external packages

  for (const file of files) {
    const rel = relative(rootDir, file);
    forward.set(rel, new Set());
    reverse.set(rel, new Set());
    externals.set(rel, new Set());
  }

  for (const file of files) {
    const rel = relative(rootDir, file);
    let code;
    try { code = readFileSync(file, 'utf-8'); } catch { continue; }

    const isPython = PY_EXTENSIONS.some(ext => file.endsWith(ext));
    const isCSharp = CS_EXTENSIONS.some(ext => file.endsWith(ext));
    const { local, external } = isCSharp ? extractCsImports(code) : isPython ? extractPyImports(code) : extractJsImports(code, file);

    for (const imp of local) {
      const resolved = resolveLocalImport(imp, file, rootDir, allFilesSet);
      if (resolved && forward.has(resolved)) {
        forward.get(rel).add(resolved);
        reverse.get(resolved).add(rel);
      }
    }

    const extSet = externals.get(rel);
    for (const pkg of external) extSet.add(pkg);
  }

  return { forward, reverse, externals };
}

// ── Cycle detection (DFS) ──

function detectCycles(forward) {
  const cycles = [];
  const visited = new Set();
  const inStack = new Set();
  const stack = [];

  function dfs(node) {
    if (inStack.has(node)) {
      const cycleStart = stack.indexOf(node);
      cycles.push([...stack.slice(cycleStart), node]);
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    stack.push(node);

    const deps = forward.get(node);
    if (deps) {
      for (const dep of deps) dfs(dep);
    }

    stack.pop();
    inStack.delete(node);
  }

  for (const node of forward.keys()) {
    if (!visited.has(node)) dfs(node);
  }

  return cycles;
}

// ── Markdown output ──

function formatMarkdown(projectName, forward, reverse, externals, cycles, rootDir) {
  const lines = [];
  lines.push(`# Dependency Graph: ${projectName}`);
  lines.push(`git-sha: ${getGitSha(rootDir)}`);
  lines.push('');

  // Summary
  const totalFiles = forward.size;
  const totalImports = [...forward.values()].reduce((sum, s) => sum + s.size, 0);
  const allExternals = new Set([...externals.values()].flatMap(s => [...s]));

  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Files:** ${totalFiles}`);
  lines.push(`- **Internal imports:** ${totalImports}`);
  lines.push(`- **External packages:** ${allExternals.size}`);
  lines.push(`- **Circular dependencies:** ${cycles.length}`);
  lines.push('');

  // Circular dependencies
  if (cycles.length > 0) {
    lines.push('## Circular Dependencies');
    lines.push('');
    for (const cycle of cycles) {
      lines.push(`- ${cycle.join(' → ')}`);
    }
    lines.push('');
  }

  // External packages
  if (allExternals.size > 0) {
    lines.push('## External Packages');
    lines.push('');
    lines.push([...allExternals].sort().join(', '));
    lines.push('');
  }

  // Per-file graph
  lines.push('## File Graph');
  lines.push('');

  const sortedFiles = [...forward.keys()].sort();
  for (const file of sortedFiles) {
    const deps = forward.get(file);
    const importedBy = reverse.get(file);
    const ext = externals.get(file);

    // Skip isolated files (no deps, no importers, no externals)
    if (deps.size === 0 && importedBy.size === 0 && ext.size === 0) continue;

    lines.push(`### ${file}`);
    if (deps.size > 0) {
      lines.push(`imports: ${[...deps].sort().join(', ')}`);
    }
    if (importedBy.size > 0) {
      lines.push(`imported-by: ${[...importedBy].sort().join(', ')}`);
    }
    if (ext.size > 0) {
      lines.push(`external: ${[...ext].sort().join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── Main ──

function getDateStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

const args = process.argv.slice(2);
let targetPath = process.cwd();

for (const arg of args) {
  if (arg === '--help' || arg === '-h') {
    console.log(`Usage: node dep-graph.js [path]\n\nGenerate a dependency graph for a JS/TS/Python/C# project.\nZero dependencies — only requires Node.js.`);
    process.exit(0);
  } else if (!arg.startsWith('-')) {
    targetPath = arg;
  }
}

targetPath = resolve(targetPath);
const projectName = basename(targetPath);
const files = collectFiles(targetPath);
const { forward, reverse, externals } = buildGraph(files, targetPath);
const cycles = detectCycles(forward);
const output = formatMarkdown(projectName, forward, reverse, externals, cycles, targetPath);

const outDir = join(targetPath, '.orchestration', 'tools');
mkdirSync(outDir, { recursive: true });
const filename = `depgraph_${projectName}_${getDateStamp()}.md`;
const outputPath = join(outDir, filename);
writeFileSync(outputPath, output);

const totalImports = [...forward.values()].reduce((sum, s) => sum + s.size, 0);
const totalExternal = new Set([...externals.values()].flatMap(s => [...s])).size;

console.log(`\nDependency graph complete!\n`);
console.log(`  Saved to: ${outputPath}\n`);
console.log(`  Files analyzed:     ${files.length}`);
console.log(`  Internal imports:   ${totalImports}`);
console.log(`  External packages:  ${totalExternal}`);
console.log(`  Circular deps:      ${cycles.length}`);
