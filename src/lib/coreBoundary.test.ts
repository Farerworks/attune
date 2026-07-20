import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ARCH-REVIEW §3-1 — automated enforcement of the core-module boundary.
// Static text scan only; no build/runtime impact.

const LIB_DIR = path.resolve(__dirname);       // src/lib
const SRC_DIR = path.resolve(__dirname, '..'); // src

function walk(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files: string[] = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function extractImportSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const re = /\bfrom\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) specifiers.push(m[1]);
  return specifiers;
}

function moduleBasename(specifier: string): string {
  const last = specifier.split('/').pop() ?? specifier;
  return last.replace(/\.(ts|tsx)$/, '');
}

describe('core boundary — ARCH-REVIEW §3-1', () => {
  it('core files (saju/tenGods/branchRelations/sinsal) only import from the whitelist', () => {
    const CORE_FILES = ['saju.ts', 'tenGods.ts', 'branchRelations.ts', 'sinsal.ts'];
    const WHITELIST = new Set(['lunar-javascript', './saju']);
    const violations: string[] = [];

    for (const file of CORE_FILES) {
      const source = fs.readFileSync(path.join(LIB_DIR, file), 'utf8');
      for (const specifier of extractImportSpecifiers(source)) {
        if (!WHITELIST.has(specifier)) {
          violations.push(`${file} imports disallowed module: '${specifier}'`);
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('tenGods/branchRelations/sinsal/promptFragments are only imported by their approved consumers', () => {
    const GUARDED_MODULES = ['tenGods', 'branchRelations', 'sinsal', 'promptFragments'];
    const ALLOWED_IMPORTERS = new Set([
      'briefing.ts', 'briefing.test.ts',
      'tenGods.test.ts', 'branchRelations.test.ts', 'sinsal.test.ts',
      'promptFragments.ts', 'promptFragments.test.ts',
    ]);

    const violations: string[] = [];

    for (const file of walk(SRC_DIR)) {
      const importerName = path.basename(file);
      if (ALLOWED_IMPORTERS.has(importerName)) continue;

      const source = fs.readFileSync(file, 'utf8');
      for (const specifier of extractImportSpecifiers(source)) {
        const base = moduleBasename(specifier);
        if (GUARDED_MODULES.includes(base)) {
          violations.push(
            `${path.relative(SRC_DIR, file)} imports guarded module '${base}' — not an approved consumer`,
          );
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });
});
