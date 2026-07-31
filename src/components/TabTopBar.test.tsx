import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// BRIEF-091 — jsdom's CSS parser doesn't support env(), so a rendered-style
// assertion can't see this property (it silently drops the declaration).
// Static text scan of the source is the only reliable check here.

const SOURCE = fs.readFileSync(path.join(__dirname, 'TabTopBar.tsx'), 'utf8');

describe('TabTopBar — safe-area top padding (BRIEF-091)', () => {
  it('sticky container declares paddingTop: env(safe-area-inset-top, 0px)', () => {
    expect(SOURCE).toContain("paddingTop: 'env(safe-area-inset-top, 0px)'");
  });

  it('background/blur are unchanged (not made opaque)', () => {
    expect(SOURCE).toContain('rgba(250,248,244,0.92)');
    expect(SOURCE).toContain('blur(8px)');
  });
});
