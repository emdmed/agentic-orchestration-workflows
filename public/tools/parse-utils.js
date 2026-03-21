// parse-utils.js — Shared parsing utilities for compaction/dep-graph/symbols tools
// Zero dependencies — uses only built-in Node.js modules

/**
 * Replace string literals, template literals, and comments with
 * whitespace-preserving placeholders. Keeps line numbers intact so
 * downstream regex still reports correct line numbers.
 *
 * @param {string} code  — raw source code
 * @param {string} language — 'js'|'ts'|'cs'|'py'
 * @returns {string} cleaned code with strings/comments blanked
 */
export function stripCommentsAndStrings(code, language) {
  const chars = code.split('');
  const len = chars.length;
  let i = 0;
  const result = [];

  while (i < len) {
    const ch = chars[i];
    const next = i + 1 < len ? chars[i + 1] : '';

    // Python: # line comments
    if (language === 'py' && ch === '#') {
      while (i < len && chars[i] !== '\n') { result.push(' '); i++; }
      continue;
    }

    // Python: triple-quoted strings
    if (language === 'py' && (ch === '"' || ch === "'")) {
      const q = ch;
      if (i + 2 < len && chars[i + 1] === q && chars[i + 2] === q) {
        result.push(' ', ' ', ' ');
        i += 3;
        while (i < len) {
          if (chars[i] === '\n') { result.push('\n'); i++; }
          else if (chars[i] === q && i + 2 < len && chars[i + 1] === q && chars[i + 2] === q) {
            result.push(' ', ' ', ' '); i += 3; break;
          } else { result.push(' '); i++; }
        }
        continue;
      }
    }

    // C-style line comments: //
    if ((language !== 'py') && ch === '/' && next === '/') {
      while (i < len && chars[i] !== '\n') { result.push(' '); i++; }
      continue;
    }

    // C-style block comments: /* ... */
    if ((language !== 'py') && ch === '/' && next === '*') {
      result.push(' ', ' ');
      i += 2;
      while (i < len) {
        if (chars[i] === '\n') { result.push('\n'); i++; }
        else if (chars[i] === '*' && i + 1 < len && chars[i + 1] === '/') {
          result.push(' ', ' '); i += 2; break;
        } else { result.push(' '); i++; }
      }
      continue;
    }

    // JS/TS template literals: `...`
    if ((language === 'js' || language === 'ts') && ch === '`') {
      result.push(' ');
      i++;
      let depth = 0;
      while (i < len) {
        if (chars[i] === '\\') { result.push(' ', ' '); i += 2; continue; }
        if (chars[i] === '\n') { result.push('\n'); i++; continue; }
        if (chars[i] === '$' && i + 1 < len && chars[i + 1] === '{') {
          depth++;
          result.push(' ', ' ');
          i += 2;
          continue;
        }
        if (depth > 0 && chars[i] === '}') {
          depth--;
          result.push(' ');
          i++;
          continue;
        }
        if (depth === 0 && chars[i] === '`') {
          result.push(' ');
          i++;
          break;
        }
        // Inside ${...} expression, keep content so imports are visible
        if (depth > 0) {
          result.push(chars[i]);
        } else {
          result.push(' ');
        }
        i++;
      }
      continue;
    }

    // C# verbatim strings: @"..."
    if (language === 'cs' && ch === '@' && next === '"') {
      result.push(' ', ' ');
      i += 2;
      while (i < len) {
        if (chars[i] === '\n') { result.push('\n'); i++; }
        else if (chars[i] === '"' && i + 1 < len && chars[i + 1] === '"') {
          result.push(' ', ' '); i += 2;
        } else if (chars[i] === '"') {
          result.push(' '); i++; break;
        } else { result.push(' '); i++; }
      }
      continue;
    }

    // Regular string literals: "..." or '...'
    if (ch === '"' || ch === "'") {
      const quote = ch;
      result.push(' ');
      i++;
      while (i < len) {
        if (chars[i] === '\\') { result.push(' ', ' '); i += 2; continue; }
        if (chars[i] === '\n') { result.push('\n'); i++; break; } // unterminated
        if (chars[i] === quote) { result.push(' '); i++; break; }
        result.push(' ');
        i++;
      }
      continue;
    }

    result.push(ch);
    i++;
  }

  return result.join('');
}

/**
 * Read lines starting at `startLine` until `openChar`/`closeChar` are balanced.
 * Handles nested brackets. Counts brackets only in non-string/comment context
 * (assumes input has already been pre-processed with stripCommentsAndStrings, or
 * caller accepts approximate matching).
 *
 * @param {string[]} lines
 * @param {number} startLine — index into lines array
 * @param {string} openChar
 * @param {string} closeChar
 * @returns {{ text: string, endIndex: number }}
 */
export function readUntilBalanced(lines, startLine, openChar = '(', closeChar = ')') {
  let depth = 0;
  let result = '';
  let i = startLine;
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

/**
 * Extract a balanced `<...>` generic expression from `text` starting at `startIndex`.
 * Handles nested generics like `Map<string, List<int>>`.
 *
 * Heuristic: only starts counting if text[startIndex] === '<'.
 *
 * @param {string} text
 * @param {number} startIndex — position of the opening `<`
 * @returns {{ generic: string, endIndex: number } | null}
 */
export function extractBalancedGenerics(text, startIndex) {
  if (startIndex >= text.length || text[startIndex] !== '<') return null;

  let depth = 0;
  let i = startIndex;
  for (; i < text.length; i++) {
    if (text[i] === '<') depth++;
    else if (text[i] === '>') {
      depth--;
      if (depth === 0) {
        return { generic: text.slice(startIndex, i + 1), endIndex: i };
      }
    }
  }
  // Unbalanced — return what we have
  return { generic: text.slice(startIndex, i), endIndex: i - 1 };
}

/**
 * Strip type annotations from a parameter string, counting `<>` depth so
 * that `Map<string, number>` isn't split at the inner comma.
 *
 * Handles:  `foo: Map<string, List<number>>, bar: string = 'x'`
 *   →       `foo, bar`
 *
 * @param {string} paramStr
 * @returns {string}
 */
export function simplifyTypeAnnotation(paramStr) {
  if (!paramStr) return '';

  const result = [];
  let i = 0;
  const len = paramStr.length;

  while (i < len) {
    const ch = paramStr[i];

    // Hit a colon — skip the type annotation
    if (ch === ':') {
      i++; // skip ':'
      // Skip whitespace
      while (i < len && paramStr[i] === ' ') i++;
      // Consume the type, respecting <> and () depth
      let angleDepth = 0;
      let parenDepth = 0;
      while (i < len) {
        const c = paramStr[i];
        if (c === '<') angleDepth++;
        else if (c === '>') { if (angleDepth > 0) angleDepth--; else break; }
        else if (c === '(') parenDepth++;
        else if (c === ')') { if (parenDepth > 0) parenDepth--; else break; }
        else if (c === ',' && angleDepth === 0 && parenDepth === 0) break;
        else if (c === '=' && angleDepth === 0 && parenDepth === 0) break;
        else if (c === '}' && angleDepth === 0 && parenDepth === 0) break;
        i++;
      }
      continue;
    }

    result.push(ch);
    i++;
  }

  return result.join('').replace(/\s+/g, ' ').trim();
}

/**
 * Set of known C# modifiers. Used to consume any number of modifiers before
 * a keyword instead of relying on fixed-order alternation.
 */
export const CS_MODIFIERS = new Set([
  'public', 'private', 'protected', 'internal',
  'static', 'async', 'virtual', 'override', 'abstract',
  'sealed', 'partial', 'readonly', 'new', 'extern',
  'volatile', 'unsafe', 'ref',
]);

/**
 * Consume any number of known C# modifiers from the start of a token array.
 *
 * @param {string[]} tokens — whitespace-split tokens from a trimmed line
 * @returns {{ modifiers: Set<string>, rest: string[] }}
 */
export function consumeModifiers(tokens) {
  const modifiers = new Set();
  let idx = 0;
  while (idx < tokens.length && CS_MODIFIERS.has(tokens[idx])) {
    modifiers.add(tokens[idx]);
    idx++;
  }
  return { modifiers, rest: tokens.slice(idx) };
}

/**
 * Detect language from file extension.
 * @param {string} filePath
 * @returns {'js'|'ts'|'cs'|'py'}
 */
export function detectLanguage(filePath) {
  if (filePath.endsWith('.py')) return 'py';
  if (filePath.endsWith('.cs')) return 'cs';
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx') || filePath.endsWith('.mts') || filePath.endsWith('.cts')) return 'ts';
  return 'js';
}
