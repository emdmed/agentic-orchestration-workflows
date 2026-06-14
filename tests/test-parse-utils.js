#!/usr/bin/env node

// Test: parse-utils.js — unit tests for all exported functions
// Commit: 7f8ac4d9e0c219e7d87121403aa7b4fb51a3fda2
// Run: node --experimental-vm-modules tests/test-parse-utils.js

import { strict as assert } from 'node:assert';
import {
  stripCommentsAndStrings,
  readUntilBalanced,
  extractBalancedGenerics,
  simplifyTypeAnnotation,
  consumeModifiers,
  detectLanguage,
  CS_MODIFIERS,
} from '../public/tools/parse-utils.js';

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

// ── stripCommentsAndStrings ──

console.log('\n── stripCommentsAndStrings ──');

test('JS: strips single-line comments', () => {
  const result = stripCommentsAndStrings('const x = 1; // comment\nconst y = 2;', 'js');
  assert.ok(!result.includes('comment'));
  assert.ok(result.includes('const x = 1;'));
  assert.ok(result.includes('const y = 2;'));
});

test('JS: strips block comments', () => {
  const result = stripCommentsAndStrings('const x = /* hidden */ 1;', 'js');
  assert.ok(!result.includes('hidden'));
  assert.ok(result.includes('const x ='));
});

test('JS: strips multi-line block comments preserving line count', () => {
  const code = 'a\n/* line1\nline2\nline3 */\nb';
  const result = stripCommentsAndStrings(code, 'js');
  assert.equal(result.split('\n').length, code.split('\n').length);
  assert.ok(result.includes('a'));
  assert.ok(result.includes('b'));
});

test('JS: strips double-quoted strings', () => {
  const result = stripCommentsAndStrings('const s = "hello world";', 'js');
  assert.ok(!result.includes('hello world'));
  assert.ok(result.includes('const s ='));
});

test('JS: strips single-quoted strings', () => {
  const result = stripCommentsAndStrings("const s = 'hello';", 'js');
  assert.ok(!result.includes('hello'));
});

test('JS: strips template literals', () => {
  const result = stripCommentsAndStrings('const s = `template ${expr} text`;', 'js');
  assert.ok(!result.includes('template'));
  assert.ok(!result.includes('text'));
  // Expression inside ${} should be preserved
  assert.ok(result.includes('expr'));
});

test('JS: handles escaped quotes in strings', () => {
  const result = stripCommentsAndStrings('const s = "say \\"hi\\"";', 'js');
  assert.ok(!result.includes('say'));
  assert.ok(!result.includes('hi'));
});

test('TS: works same as JS', () => {
  const result = stripCommentsAndStrings('const x: string = "test"; // typed', 'ts');
  assert.ok(!result.includes('test'));
  assert.ok(!result.includes('typed'));
  assert.ok(result.includes('const x: string ='));
});

test('Python: strips # line comments', () => {
  const result = stripCommentsAndStrings('x = 1  # comment\ny = 2', 'py');
  assert.ok(!result.includes('comment'));
  assert.ok(result.includes('x = 1'));
  assert.ok(result.includes('y = 2'));
});

test('Python: strips triple-quoted strings', () => {
  const result = stripCommentsAndStrings('x = """hello\nworld"""\ny = 1', 'py');
  assert.ok(!result.includes('hello'));
  assert.ok(!result.includes('world'));
  assert.ok(result.includes('y = 1'));
});

test('Python: preserves line count in triple-quoted strings', () => {
  const code = 'x = """\nline1\nline2\n"""\ny = 1';
  const result = stripCommentsAndStrings(code, 'py');
  assert.equal(result.split('\n').length, code.split('\n').length);
});

test('Python: strips single-quoted strings', () => {
  const result = stripCommentsAndStrings("x = 'hello'", 'py');
  assert.ok(!result.includes('hello'));
});

test('C#: strips verbatim strings @"..."', () => {
  const result = stripCommentsAndStrings('var s = @"verbatim ""quoted"" text";', 'cs');
  assert.ok(!result.includes('verbatim'));
  assert.ok(!result.includes('quoted'));
});

test('C#: strips // and /* */ comments', () => {
  const result = stripCommentsAndStrings('int x = 1; // comment\n/* block */ int y = 2;', 'cs');
  assert.ok(!result.includes('comment'));
  assert.ok(!result.includes('block'));
});

test('preserves line numbers across all languages', () => {
  for (const lang of ['js', 'ts', 'py', 'cs']) {
    const code = 'line1\n"str"\nline3\n// comment\nline5';
    const result = stripCommentsAndStrings(code, lang);
    assert.equal(result.split('\n').length, 5, `${lang}: line count mismatch`);
  }
});

// ── readUntilBalanced ──

console.log('\n── readUntilBalanced ──');

test('balanced parens on single line', () => {
  const lines = ['foo(a, b)'];
  const { text, endIndex } = readUntilBalanced(lines, 0, '(', ')');
  assert.equal(endIndex, 0);
  assert.ok(text.includes('foo(a, b)'));
});

test('balanced parens across multiple lines', () => {
  const lines = ['foo(', '  a,', '  b', ')'];
  const { text, endIndex } = readUntilBalanced(lines, 0, '(', ')');
  assert.equal(endIndex, 3);
  assert.ok(text.includes('foo('));
  assert.ok(text.includes('b'));
});

test('nested brackets', () => {
  const lines = ['{ a: { b: 1 } }'];
  const { text, endIndex } = readUntilBalanced(lines, 0, '{', '}');
  assert.equal(endIndex, 0);
});

test('balanced square brackets', () => {
  const lines = ['[a, [b, c]]'];
  const { text, endIndex } = readUntilBalanced(lines, 0, '[', ']');
  assert.equal(endIndex, 0);
});

test('unbalanced — reads to end of array', () => {
  const lines = ['foo(', '  a,'];
  const { text, endIndex } = readUntilBalanced(lines, 0, '(', ')');
  // readUntilBalanced reads until depth <= 0 or exhausts lines;
  // last index checked is lines.length - 1, but loop goes to lines.length
  assert.ok(endIndex >= 1, 'should read past first line');
});

// ── extractBalancedGenerics ──

console.log('\n── extractBalancedGenerics ──');

test('simple generic', () => {
  const result = extractBalancedGenerics('Map<string, number>', 3);
  assert.ok(result);
  assert.equal(result.generic, '<string, number>');
});

test('nested generics', () => {
  const result = extractBalancedGenerics('Map<string, List<int>>', 3);
  assert.ok(result);
  assert.equal(result.generic, '<string, List<int>>');
});

test('deeply nested generics', () => {
  const result = extractBalancedGenerics('Map<string, Map<number, Array<Set<boolean>>>>', 3);
  assert.ok(result);
  assert.equal(result.generic, '<string, Map<number, Array<Set<boolean>>>>');
});

test('returns null when no < at startIndex', () => {
  const result = extractBalancedGenerics('Map string', 3);
  assert.equal(result, null);
});

test('handles unbalanced generics', () => {
  const result = extractBalancedGenerics('Map<string, List<int>', 3);
  assert.ok(result);
  // Should return what it can
  assert.ok(result.generic.startsWith('<'));
});

// ── simplifyTypeAnnotation ──

console.log('\n── simplifyTypeAnnotation ──');

test('strips simple type annotation', () => {
  const result = simplifyTypeAnnotation('foo: string, bar: number');
  assert.equal(result, 'foo, bar');
});

test('strips generic type annotation', () => {
  const result = simplifyTypeAnnotation('foo: Map<string, number>, bar: string');
  assert.equal(result, 'foo, bar');
});

test('strips nested generic type annotation', () => {
  const result = simplifyTypeAnnotation('foo: Map<string, List<number>>, bar: string');
  assert.equal(result, 'foo, bar');
});

test('handles default values', () => {
  const result = simplifyTypeAnnotation('foo: string = "x", bar: number');
  // simplifyTypeAnnotation strips the type but whitespace around '=' may compress
  assert.ok(result.includes('foo'), 'should keep param name');
  assert.ok(result.includes('"x"'), 'should keep default value');
  assert.ok(result.includes('bar'), 'should keep second param');
});

test('returns empty for empty input', () => {
  assert.equal(simplifyTypeAnnotation(''), '');
  assert.equal(simplifyTypeAnnotation(null), '');
  assert.equal(simplifyTypeAnnotation(undefined), '');
});

test('passes through plain params', () => {
  const result = simplifyTypeAnnotation('a, b, c');
  assert.equal(result, 'a, b, c');
});

// ── consumeModifiers ──

console.log('\n── consumeModifiers ──');

test('consumes C# modifiers', () => {
  const { modifiers, rest } = consumeModifiers(['public', 'static', 'async', 'Task<int>', 'Foo(']);
  assert.ok(modifiers.has('public'));
  assert.ok(modifiers.has('static'));
  assert.ok(modifiers.has('async'));
  assert.deepEqual(rest, ['Task<int>', 'Foo(']);
});

test('no modifiers', () => {
  const { modifiers, rest } = consumeModifiers(['void', 'Foo(']);
  assert.equal(modifiers.size, 0);
  assert.deepEqual(rest, ['void', 'Foo(']);
});

test('all modifiers consumed', () => {
  const { modifiers, rest } = consumeModifiers(['public', 'override']);
  assert.equal(modifiers.size, 2);
  assert.deepEqual(rest, []);
});

test('CS_MODIFIERS contains expected set', () => {
  for (const mod of ['public', 'private', 'protected', 'internal', 'static', 'async', 'virtual', 'override', 'abstract', 'sealed', 'partial', 'readonly']) {
    assert.ok(CS_MODIFIERS.has(mod), `missing modifier: ${mod}`);
  }
});

// ── detectLanguage ──

console.log('\n── detectLanguage ──');

test('detects Python', () => assert.equal(detectLanguage('foo.py'), 'py'));
test('detects C#', () => assert.equal(detectLanguage('foo.cs'), 'cs'));
test('detects TypeScript', () => assert.equal(detectLanguage('foo.ts'), 'ts'));
test('detects TSX', () => assert.equal(detectLanguage('foo.tsx'), 'ts'));
test('detects MTS', () => assert.equal(detectLanguage('foo.mts'), 'ts'));
test('detects CTS', () => assert.equal(detectLanguage('foo.cts'), 'ts'));
test('defaults to JS for .js', () => assert.equal(detectLanguage('foo.js'), 'js'));
test('defaults to JS for .jsx', () => assert.equal(detectLanguage('foo.jsx'), 'js'));
test('defaults to JS for unknown', () => assert.equal(detectLanguage('foo.xyz'), 'js'));

// ── Integration: strings.ts fixture ──

console.log('\n── Integration: stripCommentsAndStrings on strings.ts fixture ──');

test('import traps in strings/comments are blanked', () => {
  // Simulate the strings.ts content
  const code = `import { realImport } from './real-module';
import type { RealType } from './real-types';

// This comment has import { fake } from 'fake-module'; — should be ignored
/*
  Multi-line comment with:
  import { alsoFake } from 'another-fake';
  const x = require('fake-require');
*/

const fakeImportInString = "import { notReal } from 'string-import';";
const anotherFake = 'import { alsoNotReal } from "single-quote-fake"';
const templateFake = \`import { templateFake } from 'template-import';\`;

export function processData(input: string): string {
  return input.toUpperCase();
}`;

  const result = stripCommentsAndStrings(code, 'ts');

  // Real imports should survive
  assert.ok(result.includes("import { realImport } from"));
  assert.ok(result.includes("import type { RealType } from"));

  // Fake imports in comments/strings should be blanked
  assert.ok(!result.includes('fake-module'));
  assert.ok(!result.includes('another-fake'));
  assert.ok(!result.includes('fake-require'));
  assert.ok(!result.includes('string-import'));
  assert.ok(!result.includes('single-quote-fake'));
  assert.ok(!result.includes('template-import'));

  // Real code should survive
  assert.ok(result.includes('export function processData'));
});

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
