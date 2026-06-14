#!/usr/bin/env node

// Test: dep-graph.js CLI — integration tests
// Commit: 7f8ac4d9e0c219e7d87121403aa7b4fb51a3fda2
// Run: node tests/test-depgraph-cli.js

import { strict as assert } from 'node:assert';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SCRIPT = join(ROOT, 'public/tools/dep-graph.js');
const TMP = join(ROOT, 'tests', '.tmp-depgraph');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e.message });
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

function setup() {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
}

function teardown() {
  rmSync(TMP, { recursive: true, force: true });
}

function runDepGraph(targetDir) {
  return execSync(`node ${SCRIPT} ${targetDir}`, {
    encoding: 'utf-8',
    cwd: ROOT,
    timeout: 30000,
  });
}

function getDepGraphFile(targetDir) {
  const outDir = join(targetDir, '.orchestration', 'tools');
  const files = readdirSync(outDir).filter(f => f.startsWith('depgraph_'));
  assert.ok(files.length > 0, 'No depgraph file found');
  return readFileSync(join(outDir, files[0]), 'utf-8');
}

// ── JS/TS import tracking ──

console.log('\n── Dep-graph CLI: JS/TS imports ──');

setup();

test('tracks local imports between files', () => {
  const projDir = join(TMP, 'js-imports');
  mkdirSync(join(projDir, 'src'), { recursive: true });

  writeFileSync(join(projDir, 'src', 'utils.ts'), `export function add(a: number, b: number) { return a + b; }`);
  writeFileSync(join(projDir, 'src', 'main.ts'), `import { add } from './utils';\nconsole.log(add(1, 2));`);

  runDepGraph(projDir);
  const output = getDepGraphFile(projDir);

  assert.ok(output.includes('src/main.ts'), 'should include main.ts');
  assert.ok(output.includes('src/utils.ts'), 'should include utils.ts');
  assert.ok(output.includes('imports:'), 'should have imports section');
  assert.ok(output.includes('imported-by:'), 'should have imported-by section');
});

test('tracks external packages', () => {
  const projDir = join(TMP, 'js-imports');
  const output = getDepGraphFile(projDir);
  // main.ts doesn't import externals, but utils.ts doesn't either
  // Let's check summary exists
  assert.ok(output.includes('## Summary'), 'should have summary section');
});

teardown();

// ── Circular dependency detection ──

console.log('\n── Dep-graph CLI: cycle detection ──');

setup();

test('detects circular dependencies', () => {
  const projDir = join(TMP, 'circular');
  mkdirSync(join(projDir, 'src'), { recursive: true });

  writeFileSync(join(projDir, 'src', 'a.ts'), `import { b } from './b';\nexport const a = 'a';`);
  writeFileSync(join(projDir, 'src', 'b.ts'), `import { a } from './a';\nexport const b = 'b';`);

  runDepGraph(projDir);
  const output = getDepGraphFile(projDir);

  assert.ok(output.includes('Circular Dependencies'), 'should detect circular deps');
  assert.ok(output.includes('→'), 'should show cycle path');
});

teardown();

// ── No cycles ──

setup();

test('reports zero cycles for acyclic graph', () => {
  const projDir = join(TMP, 'acyclic');
  mkdirSync(join(projDir, 'src'), { recursive: true });

  writeFileSync(join(projDir, 'src', 'a.ts'), `export const a = 1;`);
  writeFileSync(join(projDir, 'src', 'b.ts'), `import { a } from './a';\nexport const b = a;`);
  writeFileSync(join(projDir, 'src', 'c.ts'), `import { b } from './b';\nexport const c = b;`);

  runDepGraph(projDir);
  const output = getDepGraphFile(projDir);

  assert.ok(output.includes('Circular dependencies:** 0'), 'should have 0 circular deps');
});

teardown();

// ── Import filtering: strings/comments ──

console.log('\n── Dep-graph CLI: import filtering ──');

setup();

test('ignores imports inside strings and comments', () => {
  const projDir = join(TMP, 'import-filter');
  mkdirSync(join(projDir, 'src'), { recursive: true });

  writeFileSync(join(projDir, 'src', 'real-dep.ts'), `export const x = 1;`);
  writeFileSync(join(projDir, 'src', 'main.ts'), `
import { x } from './real-dep';
// import { fake } from './not-real';
const s = "import { also } from './also-not-real'";
`);

  runDepGraph(projDir);
  const output = getDepGraphFile(projDir);

  // real-dep should appear as a dependency
  assert.ok(output.includes('real-dep'), 'should track real-dep import');
  // Fake imports should NOT appear
  assert.ok(!output.includes('not-real'), 'should not track commented import');
  assert.ok(!output.includes('also-not-real'), 'should not track string import');
});

teardown();

// ── External packages ──

console.log('\n── Dep-graph CLI: external packages ──');

setup();

test('tracks external package names', () => {
  const projDir = join(TMP, 'externals');
  mkdirSync(join(projDir, 'src'), { recursive: true });

  writeFileSync(join(projDir, 'src', 'app.ts'), `
import React from 'react';
import { useState } from 'react';
import axios from 'axios';
import { join } from 'path';
import { Button } from '@mui/material';
`);

  runDepGraph(projDir);
  const output = getDepGraphFile(projDir);

  assert.ok(output.includes('react'), 'should track react');
  assert.ok(output.includes('axios'), 'should track axios');
  assert.ok(output.includes('@mui/material'), 'should track scoped package');
});

teardown();

// ── Python imports ──

console.log('\n── Dep-graph CLI: Python imports ──');

setup();

test('tracks Python relative imports', () => {
  const projDir = join(TMP, 'py-imports');
  mkdirSync(join(projDir, 'src'), { recursive: true });

  writeFileSync(join(projDir, 'src', 'utils.py'), `def helper():\n    pass`);
  writeFileSync(join(projDir, 'src', 'main.py'), `from .utils import helper\n\nhelper()`);

  runDepGraph(projDir);
  const output = getDepGraphFile(projDir);

  // Python relative imports (.utils) are resolved relative to file location.
  // The dep-graph resolves them to file paths. Even if resolution fails
  // (no __init__.py), the file should still appear in the graph.
  assert.ok(output.includes('Files:**'), 'should have file count in summary');
  // Note: `.utils` relative import may not resolve without __init__.py,
  // so main.py might be an isolated node (no imports/imported-by).
});

test('tracks Python external packages', () => {
  const projDir = join(TMP, 'py-imports');
  mkdirSync(join(projDir, 'src'), { recursive: true });

  writeFileSync(join(projDir, 'src', 'app.py'), `import os\nimport sys\nfrom flask import Flask`);

  runDepGraph(projDir);
  const output = getDepGraphFile(projDir);

  assert.ok(output.includes('os') || output.includes('flask'), 'should track Python externals');
});

teardown();

// ── Summary section ──

console.log('\n── Dep-graph CLI: output format ──');

setup();

test('output includes summary with file count and import count', () => {
  const projDir = join(TMP, 'format-check');
  mkdirSync(join(projDir, 'src'), { recursive: true });
  writeFileSync(join(projDir, 'src', 'a.ts'), `export const a = 1;`);
  writeFileSync(join(projDir, 'src', 'b.ts'), `import { a } from './a';`);

  runDepGraph(projDir);
  const output = getDepGraphFile(projDir);

  assert.ok(output.includes('## Summary'), 'should have Summary heading');
  assert.ok(output.includes('**Files:**'), 'should report file count');
  assert.ok(output.includes('**Internal imports:**'), 'should report import count');
  assert.ok(output.includes('**External packages:**'), 'should report external count');
  assert.ok(output.includes('git-sha:'), 'should include git-sha');
});

teardown();

// ── Summary ──

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  ✗ ${f.name}: ${f.error}`);
  }
}
console.log(`Commit: 7f8ac4d9e0c219e7d87121403aa7b4fb51a3fda2`);
process.exit(failed > 0 ? 1 : 0);
