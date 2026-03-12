#!/usr/bin/env node

// agentic-compaction v0.0.8
// Single-file bundle — compact a JS/TS/Python project into a structural skeleton
// Zero dependencies — uses only built-in Node.js modules
// Source: https://github.com/emdmed/agentic-compaction
//
// Usage:
//   node compaction.js [path] [--json]

import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, join, basename, dirname } from 'path';

function getGitSha(dir) {
  try { return execSync('git rev-parse HEAD', { cwd: dir, encoding: 'utf-8' }).trim(); }
  catch { return 'unknown'; }
}

// ── Parsers: Python ──

const PYTHON_EXTENSIONS = ['.py'];

const isPythonParseable = (path) => PYTHON_EXTENSIONS.some(ext => path.endsWith(ext));

const extractPythonSkeleton = (code, filePath = '') => {
  const lines = code.split('\n');
  const skeleton = { imports: [], functions: [], classes: [], constants: [] };
  let pendingDecorators = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue;
    if (/^\s/.test(line) && !/^@/.test(line)) { pendingDecorators = []; continue; }

    const decoratorMatch = line.match(/^@(\w[\w.]*)/);
    if (decoratorMatch) { pendingDecorators.push(decoratorMatch[1]); continue; }

    const importMatch = line.match(/^import\s+(.+)/);
    if (importMatch) {
      const modules = importMatch[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]);
      for (const mod of modules) skeleton.imports.push({ module: mod, names: [] });
      pendingDecorators = []; continue;
    }

    const fromImportMatch = line.match(/^from\s+([\w.]+)\s+import\s+(.+)/);
    if (fromImportMatch) {
      const module = fromImportMatch[1];
      let namesStr = fromImportMatch[2].trim();
      if (namesStr.startsWith('(')) {
        namesStr = namesStr.slice(1);
        while (i + 1 < lines.length && !namesStr.includes(')')) { i++; namesStr += ' ' + lines[i].trim(); }
        namesStr = namesStr.replace(')', '');
      }
      const names = namesStr.split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      skeleton.imports.push({ module, names });
      pendingDecorators = []; continue;
    }

    const funcMatch = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/);
    if (funcMatch) {
      let params = funcMatch[2];
      if (!line.includes(')')) {
        let j = i + 1;
        while (j < lines.length && !lines[j].includes(')')) { params += ' ' + lines[j].trim(); j++; }
        if (j < lines.length) params += ' ' + lines[j].split(')')[0].trim();
      }
      params = params.replace(/\s+/g, ' ').trim();
      skeleton.functions.push({ name: funcMatch[1], line: lineNum, decorators: [...pendingDecorators], params });
      pendingDecorators = []; continue;
    }

    const classMatch = line.match(/^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/);
    if (classMatch) {
      const bases = classMatch[2] ? classMatch[2].split(',').map(s => s.trim()).filter(Boolean) : [];
      skeleton.classes.push({ name: classMatch[1], line: lineNum, decorators: [...pendingDecorators], bases });
      pendingDecorators = []; continue;
    }

    const assignMatch = line.match(/^([A-Za-z_]\w*)\s*[=:]/);
    if (assignMatch) { skeleton.constants.push(assignMatch[1]); pendingDecorators = []; continue; }

    pendingDecorators = [];
  }
  return skeleton;
};

const formatPythonSkeleton = (skeleton) => {
  if (!skeleton) return '';
  const lines = [];
  if (skeleton.imports.length > 0) {
    const local = skeleton.imports.filter(i => i.module.startsWith('.'));
    const extCount = skeleton.imports.length - local.length;
    const parts = [];
    if (extCount > 0) parts.push(`${extCount} ext`);
    parts.push(...local.map(i => i.module));
    lines.push(`imports: ${parts.join(', ')}`);
  }
  if (skeleton.classes.length > 0) {
    lines.push(`classes: ${skeleton.classes.map(c => {
      const parts = [c.name];
      if (c.decorators.length > 0) parts.push(`@${c.decorators[0]}`);
      if (c.bases.length > 0) parts.push(`(${c.bases.join(',')})`);
      return `${parts.join(' ')}:${c.line}`;
    }).join(', ')}`);
  }
  if (skeleton.functions.length > 0) {
    lines.push(`fn: ${skeleton.functions.map(f => {
      const deco = f.decorators.length > 0 ? `@${f.decorators[0]} ` : '';
      return `${deco}${f.name}(${f.params || ''}):${f.line}`;
    }).join(', ')}`);
  }
  if (skeleton.constants.length > 0) {
    const names = skeleton.constants;
    lines.push(names.length > 5 ? `const: ${names.slice(0, 5).join(', ')} +${names.length - 5} more` : `const: ${names.join(', ')}`);
  }
  return lines.join('\n');
};

// ── Parsers: C# ──

const CS_EXTENSIONS = ['.cs'];

const isCSharpParseable = (path) => CS_EXTENSIONS.some(ext => path.endsWith(ext));

const extractCSharpSkeleton = (code, filePath = '') => {
  const lines = code.split('\n');
  const skeleton = { usings: [], namespaces: [], classes: [], interfaces: [], enums: [], functions: [], constants: [] };
  let pendingAttributes = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

    // Attributes
    const attrMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (attrMatch) { pendingAttributes.push(attrMatch[1].split('(')[0].trim()); continue; }

    // Using directives
    const usingMatch = trimmed.match(/^using\s+(?:static\s+)?([\w.]+)\s*;/);
    if (usingMatch) { skeleton.usings.push(usingMatch[1]); pendingAttributes = []; continue; }

    // Namespace
    const nsMatch = trimmed.match(/^(?:file\s+)?namespace\s+([\w.]+)/);
    if (nsMatch) { skeleton.namespaces.push(nsMatch[1]); pendingAttributes = []; continue; }

    // Enum
    const enumMatch = trimmed.match(/^(?:public|private|protected|internal)?\s*enum\s+(\w+)/);
    if (enumMatch) {
      skeleton.enums.push({ name: enumMatch[1], line: lineNum, attributes: [...pendingAttributes] });
      pendingAttributes = []; continue;
    }

    // Interface
    const ifaceMatch = trimmed.match(/^(?:public|private|protected|internal)?\s*(?:partial\s+)?interface\s+(\w+)(?:<[^>]+>)?(?:\s*:\s*(.+?))?(?:\s*\{|$)/);
    if (ifaceMatch) {
      const bases = ifaceMatch[2] ? ifaceMatch[2].split(',').map(s => s.trim()).filter(Boolean) : [];
      skeleton.interfaces.push({ name: ifaceMatch[1], line: lineNum, attributes: [...pendingAttributes], bases });
      pendingAttributes = []; continue;
    }

    // Class / struct / record
    const classMatch = trimmed.match(/^(?:public|private|protected|internal)?\s*(?:static\s+)?(?:abstract\s+)?(?:sealed\s+)?(?:partial\s+)?(?:class|struct|record)\s+(\w+)(?:<[^>]+>)?(?:\s*\(([^)]*)\))?(?:\s*:\s*(.+?))?(?:\s*\{|$)/);
    if (classMatch) {
      const bases = classMatch[3] ? classMatch[3].split(',').map(s => s.trim()).filter(Boolean) : [];
      const params = classMatch[2] ? classMatch[2].replace(/\s+/g, ' ').trim() : undefined;
      const isStatic = /\bstatic\b/.test(trimmed);
      const isAbstract = /\babstract\b/.test(trimmed);
      skeleton.classes.push({ name: classMatch[1], line: lineNum, attributes: [...pendingAttributes], bases, params, static: isStatic, abstract: isAbstract });
      pendingAttributes = []; continue;
    }

    // Top-level or static methods (simplified: access modifier + return type + name + params)
    // Match method start even if params span multiple lines
    const methodStartMatch = trimmed.match(/^(?:public|private|protected|internal)?\s*(?:static\s+)?(?:async\s+)?(?:virtual\s+)?(?:override\s+)?(?:abstract\s+)?(?:[\w<>\[\]?,\s]+?)\s+(\w+)\s*\(/);
    if (methodStartMatch && !trimmed.includes(' class ') && !trimmed.includes(' interface ') && !trimmed.includes(' struct ') && !trimmed.includes(' enum ')) {
      const name = methodStartMatch[1];
      // Skip property getters/setters and control flow keywords
      if (name !== 'get' && name !== 'set' && name !== 'if' && name !== 'for' && name !== 'while' && name !== 'switch' && name !== 'catch' && name !== 'using' && name !== 'return' && name !== 'new') {
        const { text: fullSig, endIndex } = readUntilBalanced(lines, i, '(', ')');
        i = endIndex;
        const paramsMatch = fullSig.match(/\(([^)]*)\)/);
        let params = paramsMatch ? paramsMatch[1].replace(/\s+/g, ' ').trim() : '';
        const isAsync = /\basync\b/.test(fullSig);
        const isStatic = /\bstatic\b/.test(fullSig);
        skeleton.functions.push({ name, line: lineNum, attributes: [...pendingAttributes], params, async: isAsync, static: isStatic });
        pendingAttributes = []; continue;
      }
    }

    // Constants (const fields)
    const constMatch = trimmed.match(/^(?:public|private|protected|internal)?\s*(?:static\s+)?(?:readonly\s+)?const\s+\w+\s+(\w+)/);
    if (constMatch) { skeleton.constants.push(constMatch[1]); pendingAttributes = []; continue; }

    pendingAttributes = [];
  }
  return skeleton;
};

const formatCSharpSkeleton = (skeleton) => {
  if (!skeleton) return '';
  const lines = [];
  if (skeleton.usings.length > 0) {
    const parts = [];
    parts.push(`${skeleton.usings.length} usings`);
    lines.push(`imports: ${parts.join(', ')}`);
  }
  if (skeleton.namespaces.length > 0) {
    lines.push(`namespace: ${skeleton.namespaces.join(', ')}`);
  }
  if (skeleton.interfaces.length > 0) {
    lines.push(`interfaces: ${skeleton.interfaces.map(iface => {
      const parts = [iface.name];
      if (iface.attributes.length > 0) parts.push(`@${iface.attributes[0]}`);
      if (iface.bases.length > 0) parts.push(`(${iface.bases.join(',')})`);
      return `${parts.join(' ')}:${iface.line}`;
    }).join(', ')}`);
  }
  if (skeleton.classes.length > 0) {
    lines.push(`classes: ${skeleton.classes.map(c => {
      const parts = [c.name];
      if (c.attributes.length > 0) parts.push(`@${c.attributes[0]}`);
      if (c.bases.length > 0) parts.push(`(${c.bases.join(',')})`);
      return `${parts.join(' ')}:${c.line}`;
    }).join(', ')}`);
  }
  if (skeleton.enums.length > 0) {
    lines.push(`enums: ${skeleton.enums.map(e => `${e.name}:${e.line}`).join(', ')}`);
  }
  if (skeleton.functions.length > 0) {
    lines.push(`fn: ${skeleton.functions.map(f => {
      const asyncPrefix = f.async ? 'async ' : '';
      const staticPrefix = f.static ? 'static ' : '';
      return `${staticPrefix}${asyncPrefix}${f.name}(${f.params || ''}):${f.line}`;
    }).join(', ')}`);
  }
  if (skeleton.constants.length > 0) {
    const names = skeleton.constants;
    lines.push(names.length > 5 ? `const: ${names.slice(0, 5).join(', ')} +${names.length - 5} more` : `const: ${names.join(', ')}`);
  }
  return lines.join('\n');
};

// ── Parsers: JS/TS (regex-based, zero dependencies) ──

const JS_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts'];
const isJsParseable = (path) => JS_EXTENSIONS.some(ext => path.endsWith(ext));
const isPascalCase = (name) => /^[A-Z][a-zA-Z0-9]*$/.test(name);

/**
 * Read lines until brackets/parens are balanced, starting from line i.
 * Returns the joined string and the new index.
 */
function readUntilBalanced(lines, i, openChar = '(', closeChar = ')') {
  let depth = 0;
  let result = '';
  for (; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === openChar) depth++;
      else if (ch === closeChar) depth--;
    }
    result += (result ? ' ' : '') + line.trim();
    if (depth <= 0) break;
  }
  return { text: result, endIndex: i };
}

const extractJsSkeleton = (code, filePath = '') => {
  const lines = code.split('\n');
  const skeleton = {
    imports: [], components: [], functions: [],
    hooks: { useState: [], useEffect: [], useCallback: 0, useMemo: 0, useRef: 0, custom: [] },
    constants: [], classes: [], interfaces: [], types: [],
  };
  const exportMap = new Map();
  let currentComponentName = null; // track if we're inside a component body
  let componentIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;

    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

    // ── Track component scope (for hook detection) ──
    if (currentComponentName !== null && indent <= componentIndent && trimmed.length > 0) {
      currentComponentName = null;
      componentIndent = -1;
    }

    // ── Imports ──
    if (trimmed.startsWith('import ')) {
      // Side-effect import: import 'foo'  or  import "foo"
      const sideEffect = trimmed.match(/^import\s+['"]([^'"]+)['"]/);
      if (sideEffect) {
        skeleton.imports.push({ source: sideEffect[1], specifiers: [] });
        continue;
      }

      // Multi-line import: read until we find the `from` or `;`
      let fullImport = trimmed;
      let j = i;
      if (!fullImport.includes('from') && !fullImport.includes(';')) {
        const balanced = readUntilBalanced(lines, i, '{', '}');
        fullImport = balanced.text;
        j = balanced.endIndex;
        // Now find the `from` on remaining lines
        while (j < lines.length && !fullImport.includes('from')) {
          j++;
          if (j < lines.length) fullImport += ' ' + lines[j].trim();
        }
        i = j;
      }

      const fromMatch = fullImport.match(/^import\s+(.+?)\s+from\s+['"]([^'"]+)['"]/);
      if (fromMatch) {
        const specPart = fromMatch[1];
        const source = fromMatch[2];
        const specifiers = [];

        // default import
        const defMatch = specPart.match(/^(\w+)/);
        if (defMatch && defMatch[1] !== 'type' || (defMatch && defMatch[1] === 'type' && /^type\s+\w/.test(specPart) && !specPart.includes('{'))) {
          // `import type Foo from` or `import Foo from`
          if (defMatch[1] !== 'type') {
            specifiers.push(defMatch[1]);
          }
        }

        // namespace import
        const nsMatch = specPart.match(/\*\s+as\s+(\w+)/);
        if (nsMatch) specifiers.push(`* as ${nsMatch[1]}`);

        // named imports
        const namedMatch = specPart.match(/\{([^}]+)\}/);
        if (namedMatch) {
          const names = namedMatch[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].replace(/^type\s+/, '')).filter(Boolean);
          specifiers.push(...names);
        }

        skeleton.imports.push({ source, specifiers });
        continue;
      }
      continue;
    }

    // ── Exports ──
    if (trimmed.startsWith('export default ')) {
      const rest = trimmed.slice('export default '.length);
      const idMatch = rest.match(/^(\w+)/);
      if (idMatch && idMatch[1] !== 'function' && idMatch[1] !== 'class') {
        exportMap.set(idMatch[1], 'default');
      }
      // export default function Name / class Name — handled below
    }

    if (trimmed.startsWith('export {')) {
      let full = trimmed;
      if (!full.includes('}')) {
        const balanced = readUntilBalanced(lines, i, '{', '}');
        full = balanced.text;
        i = balanced.endIndex;
      }
      const inner = full.match(/\{([^}]+)\}/);
      if (inner) {
        const names = inner[1].split(',').map(s => {
          const parts = s.trim().split(/\s+as\s+/);
          return parts[parts.length - 1].trim();
        }).filter(Boolean);
        for (const name of names) exportMap.set(name, 'named');
      }
      continue;
    }

    // ── Top-level only constructs (no leading whitespace) ──
    const isTopLevel = indent === 0;

    // ── Interface (TS) ──
    const ifaceMatch = trimmed.match(/^(?:export\s+)?(?:declare\s+)?interface\s+(\w+)/);
    if (ifaceMatch && isTopLevel) {
      skeleton.interfaces.push({ name: ifaceMatch[1], line: lineNum });
      continue;
    }

    // ── Type alias (TS) ──
    const typeMatch = trimmed.match(/^(?:export\s+)?(?:declare\s+)?type\s+(\w+)\s*[=<]/);
    if (typeMatch && isTopLevel) {
      skeleton.types.push({ name: typeMatch[1], line: lineNum });
      continue;
    }

    // ── Class ──
    const classMatch = trimmed.match(/^(?:export\s+)?(?:export\s+default\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch && isTopLevel) {
      const name = classMatch[1];
      skeleton.classes.push({ name, line: lineNum });
      if (trimmed.includes('export')) {
        exportMap.set(name, trimmed.includes('default') ? 'default' : 'named');
      }
      continue;
    }

    // ── Function declaration ──
    const funcDeclMatch = trimmed.match(/^(?:export\s+)?(?:export\s+default\s+)?(async\s+)?function\s+(\w+)\s*\(/);
    if (funcDeclMatch && isTopLevel) {
      const isAsync = !!funcDeclMatch[1];
      const name = funcDeclMatch[2];
      // Extract params
      let paramStr = '';
      const parenStart = line.indexOf('(');
      if (parenStart !== -1) {
        const balanced = readUntilBalanced(lines, i, '(', ')');
        const match = balanced.text.match(/\(([^)]*)\)/);
        paramStr = match ? match[1].trim() : '';
        i = balanced.endIndex;
      }
      const entry = { name, line: lineNum, params: simplifyParams(paramStr), async: isAsync };
      if (isPascalCase(name)) {
        skeleton.components.push(entry);
        currentComponentName = name;
        componentIndent = indent;
      } else {
        skeleton.functions.push(entry);
      }
      if (trimmed.startsWith('export')) {
        exportMap.set(name, trimmed.includes('default') ? 'default' : 'named');
      }
      continue;
    }

    // ── Variable declarations (const/let/var) — top-level ──
    const varMatch = trimmed.match(/^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(.*)/);
    if (varMatch && isTopLevel) {
      const name = varMatch[1];
      const rhs = varMatch[2].trim();
      const isExported = trimmed.startsWith('export');

      // Arrow function or function expression
      const isArrow = /^(?:async\s+)?\(/.test(rhs) || /^(?:async\s+)?\w+\s*=>/.test(rhs);
      const isFuncExpr = /^(?:async\s+)?function/.test(rhs);

      if (isArrow || isFuncExpr) {
        const isAsync = /^async\s+/.test(rhs);
        let paramStr = '';
        if (isArrow && /^(?:async\s+)?\(/.test(rhs)) {
          const fromParen = rhs.slice(rhs.indexOf('('));
          const balanced = readUntilBalanced(lines, i, '(', ')');
          const match = balanced.text.match(/\(([^)]*)\)/);
          paramStr = match ? match[1].trim() : '';
          i = balanced.endIndex;
        } else if (isArrow) {
          const singleParam = rhs.match(/^(?:async\s+)?(\w+)\s*=>/);
          paramStr = singleParam ? singleParam[1] : '';
        } else if (isFuncExpr) {
          const balanced = readUntilBalanced(lines, i, '(', ')');
          const match = balanced.text.match(/\(([^)]*)\)/);
          paramStr = match ? match[1].trim() : '';
          i = balanced.endIndex;
        }
        const entry = { name, line: lineNum, params: simplifyParams(paramStr), async: isAsync };
        if (isPascalCase(name)) {
          skeleton.components.push(entry);
          currentComponentName = name;
          componentIndent = indent;
        } else {
          skeleton.functions.push(entry);
        }
        if (isExported) exportMap.set(name, 'named');
        continue;
      }

      // HOC: memo(...), forwardRef(...), lazy(...)
      const hocMatch = rhs.match(/^(?:React\.)?(memo|forwardRef|lazy)\s*\(/);
      if (hocMatch) {
        skeleton.components.push({ name, line: lineNum, hoc: hocMatch[1], params: '?', async: false });
        currentComponentName = name;
        componentIndent = indent;
        if (isExported) exportMap.set(name, 'named');
        continue;
      }

      // createContext
      if (/(?:React\.)?createContext\s*\(/.test(rhs)) {
        skeleton.contexts = skeleton.contexts || [];
        skeleton.contexts.push({ name, line: lineNum });
        if (isExported) exportMap.set(name, 'named');
        continue;
      }

      // Plain constant
      skeleton.constants.push(name);
      if (isExported) exportMap.set(name, 'named');
      continue;
    }

    // ── Hooks (inside component bodies) ──
    if (currentComponentName !== null && indent > componentIndent) {
      // useState
      const useStateMatch = trimmed.match(/(?:const|let|var)\s+\[(\w+)/);
      if (useStateMatch && trimmed.includes('useState(')) {
        skeleton.hooks.useState.push(useStateMatch[1]);
        continue;
      }

      // useEffect
      if (/useEffect\s*\(/.test(trimmed)) {
        // Try to find deps array — look for closing pattern on this or subsequent lines
        let depsChunk = trimmed;
        let j = i;
        // Read a few lines to find the deps array at the end of useEffect call
        while (j < Math.min(i + 20, lines.length - 1)) {
          j++;
          depsChunk += ' ' + lines[j].trim();
          // If we find the closing of useEffect, stop
          if (/\)\s*;?\s*$/.test(lines[j].trim())) break;
        }
        // Look for dependency array: , [...]) at end
        const depsMatch = depsChunk.match(/,\s*\[([^\]]*)\]\s*\)\s*;?\s*$/);
        if (depsMatch) {
          const depsStr = depsMatch[1].trim();
          const deps = depsStr ? depsStr.split(',').map(d => d.trim()).filter(Boolean) : [];
          skeleton.hooks.useEffect.push({ line: lineNum, deps });
        } else {
          // No deps found — could be infinite or complex
          skeleton.hooks.useEffect.push({ line: lineNum, deps: '?' });
        }
        continue;
      }

      // useCallback, useMemo, useRef
      if (/useCallback\s*\(/.test(trimmed)) { skeleton.hooks.useCallback++; continue; }
      if (/useMemo\s*\(/.test(trimmed)) { skeleton.hooks.useMemo++; continue; }
      if (/useRef\s*\(/.test(trimmed)) { skeleton.hooks.useRef++; continue; }

      // Custom hooks (use\w+)
      const customHookMatch = trimmed.match(/\b(use[A-Z]\w*)\s*\(/);
      if (customHookMatch) {
        const hookName = customHookMatch[1];
        if (!['useState', 'useEffect', 'useCallback', 'useMemo', 'useRef'].includes(hookName)) {
          if (!skeleton.hooks.custom.includes(hookName)) skeleton.hooks.custom.push(hookName);
        }
        continue;
      }
    }
  }

  // Apply export markers
  for (const entry of [...skeleton.components, ...skeleton.functions, ...skeleton.classes]) {
    const exportType = exportMap.get(entry.name);
    if (exportType === 'default') entry.exportMarker = '*';
    else if (exportType === 'named') entry.exportMarker = '+';
  }
  return skeleton;
};

/** Simplify a parameter string — strip type annotations for brevity */
function simplifyParams(paramStr) {
  if (!paramStr) return '';
  // Remove inline type annotations (: Type) but keep destructuring
  return paramStr
    .replace(/:\s*[^,)=}]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const formatBabelSkeleton = (skeleton) => {
  if (!skeleton) return '';
  const lines = [];
  if (skeleton.imports.length > 0) {
    const local = skeleton.imports.filter(i => i.source.startsWith('.'));
    const extCount = skeleton.imports.length - local.length;
    const parts = [];
    if (extCount > 0) parts.push(`${extCount} ext`);
    parts.push(...[...new Set(local.map(i => i.source))]);
    lines.push(`imports: ${parts.join(', ')}`);
  }
  if (skeleton.components.length > 0) {
    lines.push(`components: ${skeleton.components.map(c => {
      const marker = c.exportMarker || '';
      const params = c.params !== undefined ? `(${c.params})` : '';
      const hoc = c.hoc ? `(${c.hoc})` : '';
      return `${c.name}${hoc}${params}${marker}:${c.line}`;
    }).join(', ')}`);
  }
  if (skeleton.contexts?.length > 0) lines.push(`contexts: ${skeleton.contexts.map(c => `${c.name}:${c.line}`).join(', ')}`);
  if (skeleton.functions.length > 0) {
    lines.push(`fn: ${skeleton.functions.map(f => {
      const marker = f.exportMarker || '';
      const asyncPrefix = f.async ? 'async ' : '';
      return `${asyncPrefix}${f.name}(${f.params || ''})${marker}:${f.line}`;
    }).join(', ')}`);
  }
  if (skeleton.constants.length > 0) {
    const names = skeleton.constants;
    lines.push(names.length > 5 ? `const: ${names.slice(0, 5).join(', ')} +${names.length - 5} more` : `const: ${names.join(', ')}`);
  }
  const hookParts = [];
  if (skeleton.hooks.useState.length > 0) hookParts.push(`useState: ${skeleton.hooks.useState.join(', ')}`);
  if (skeleton.hooks.useCallback > 0) hookParts.push(`useCallback(${skeleton.hooks.useCallback})`);
  if (skeleton.hooks.useMemo > 0) hookParts.push(`useMemo(${skeleton.hooks.useMemo})`);
  if (skeleton.hooks.useRef > 0) hookParts.push(`useRef(${skeleton.hooks.useRef})`);
  if (skeleton.hooks.custom.length > 0) hookParts.push(...skeleton.hooks.custom);
  if (skeleton.hooks.useEffect.length > 0) {
    hookParts.push(...skeleton.hooks.useEffect.map(e => e.deps === null ? 'useEffect(∞)' : e.deps === '?' ? 'useEffect(?)' : `useEffect([${e.deps.join(',')}])`));
  }
  if (hookParts.length > 0) lines.push(`hooks: ${hookParts.join(', ')}`);
  if (skeleton.classes.length > 0) lines.push(`classes: ${skeleton.classes.map(c => `${c.name}${c.exportMarker || ''}:${c.line}`).join(', ')}`);
  if (skeleton.interfaces.length > 0 || skeleton.types.length > 0) {
    lines.push(`types: ${[...skeleton.interfaces, ...skeleton.types].map(t => `${t.name}:${t.line}`).join(', ')}`);
  }
  return lines.join('\n');
};

// ── Formatter ──

const estimateTokens = (text) => text ? Math.ceil(text.length / 4) : 0;
const formatTokenCount = (count) => {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return count.toString();
};

const formatOutput = (results) => {
  const lines = [];
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  for (const result of results) {
    lines.push(`## ${result.relativePath}`);
    if (result.skeleton) {
      const output = isPythonParseable(result.relativePath) ? formatPythonSkeleton(result.skeleton) : isCSharpParseable(result.relativePath) ? formatCSharpSkeleton(result.skeleton) : formatBabelSkeleton(result.skeleton);
      if (output) lines.push(output);
    }
  }
  return lines.join('\n');
};

// ── Walker ──

const SKIP_DIRECTORIES = new Set(['node_modules', 'dist', '.git', 'target', 'build', '.next', '.turbo', 'out', 'coverage', '.cache', '__pycache__', '.venv', 'venv', '.idea', '.vscode', 'bin', 'obj']);

function collectFiles(dir, rootDir = dir, files = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return files; }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) { if (!SKIP_DIRECTORIES.has(entry.name) && !entry.name.startsWith('.')) collectFiles(fullPath, rootDir, files); }
    else if (entry.isFile() && (isJsParseable(fullPath) || isPythonParseable(fullPath) || isCSharpParseable(fullPath))) {
      files.push({ path: fullPath, relativePath: fullPath.slice(rootDir.length + 1) });
    }
  }
  return files;
}

// ── Main ──

function compactProject(rootPath) {
  const files = collectFiles(rootPath);
  const results = [];
  let rawTokens = 0;
  for (const file of files) {
    try {
      const content = readFileSync(file.path, 'utf-8');
      rawTokens += estimateTokens(content);
      let skeleton = null;
      if (isPythonParseable(file.path)) skeleton = extractPythonSkeleton(content, file.path);
      else if (isJsParseable(file.path)) skeleton = extractJsSkeleton(content, file.path);
      else if (isCSharpParseable(file.path)) skeleton = extractCSharpSkeleton(content, file.path);
      results.push({ relativePath: file.relativePath, skeleton });
    } catch {}
  }
  const output = formatOutput(results);
  return { output, stats: { files: results.length, rawTokens, compactedTokens: estimateTokens(output) } };
}

function getDateStamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
}

const args = process.argv.slice(2);
let targetPath = process.cwd();
let jsonOutput = false;

for (const arg of args) {
  if (arg === '--json') jsonOutput = true;
  else if (arg === '--help' || arg === '-h') {
    console.log(`Usage: node compaction.js [path] [--json]\n\nCompact a JS/TS/Python/C# project into a structural skeleton.\nZero dependencies — only requires Node.js.`);
    process.exit(0);
  } else if (!arg.startsWith('-')) targetPath = arg;
}

targetPath = resolve(targetPath);
const { output, stats } = compactProject(targetPath);
const dirName = basename(targetPath);
const outDir = join(targetPath, '.orchestration', 'tools');
mkdirSync(outDir, { recursive: true });
const filename = `compacted_${dirName}_${getDateStamp()}.md`;
const outputPath = join(outDir, filename);
const sha = getGitSha(targetPath);
const outputWithSha = `git-sha: ${sha}\n${output}`;

writeFileSync(outputPath, jsonOutput ? JSON.stringify({ output: outputWithSha, stats }, null, 2) : outputWithSha);

const rate = stats.rawTokens > 0 ? ((1 - stats.compactedTokens / stats.rawTokens) * 100).toFixed(1) : '0';
console.log(`\nCompaction complete!\n`);
console.log(`  Saved to: ${outputPath}\n`);
console.log(`  Files:            ${stats.files}`);
console.log(`  Project tokens:   ${formatTokenCount(stats.rawTokens)}`);
console.log(`  Compacted tokens: ${formatTokenCount(stats.compactedTokens)}`);
console.log(`  Compaction rate:  ${rate}%`);
