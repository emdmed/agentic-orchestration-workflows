// Test: imports inside string literals and comments should be ignored

import { realImport } from './real-module';
import type { RealType } from './real-types';

// This comment has import { fake } from 'fake-module'; — should be ignored
/*
  Multi-line comment with:
  import { alsoFake } from 'another-fake';
  const x = require('fake-require');
*/

const fakeImportInString = "import { notReal } from 'string-import';";
const anotherFake = 'import { alsoNotReal } from "single-quote-fake"';
const templateFake = `import { templateFake } from 'template-import';`;

// Multi-line template with import-like content
const multiLineTemplate = `
  This is a template that mentions:
  import { something } from 'not-a-real-import';
  require('also-not-real');
`;

// Real code after the traps
export function processData(input: string): string {
  return input.toUpperCase();
}

export const REAL_CONSTANT = 42;

// String with nested quotes
const tricky = "He said \"import { x } from 'y'\" and left";
const escaped = 'It\'s not import { z } from "w"';

export class DataProcessor {
  process(): void {}
}
