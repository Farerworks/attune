import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// BRIEF-091 — iOS Safari zooms on focus when a text-input's font-size is under 16px.
// jsdom can't reflect this (no real layout/zoom), so this is a static text scan
// of the two input-related CSS classes rather than a rendered-style assertion.

const CSS = fs.readFileSync(path.join(__dirname, 'globals.css'), 'utf8');

function fontSizeInBlock(className: string): number {
  const re = new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`);
  const m = re.exec(CSS);
  if (!m) throw new Error(`.${className} block not found in globals.css`);
  const sizeMatch = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(m[1]);
  if (!sizeMatch) throw new Error(`.${className} has no font-size declaration`);
  return parseFloat(sizeMatch[1]);
}

describe('globals.css — text-input font-size >= 16px (BRIEF-091)', () => {
  it('.field-input is >= 16px', () => {
    expect(fontSizeInBlock('field-input')).toBeGreaterThanOrEqual(16);
  });

  it('.field-textarea is >= 16px', () => {
    expect(fontSizeInBlock('field-textarea')).toBeGreaterThanOrEqual(16);
  });
});
