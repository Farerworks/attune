// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TabTopBar } from './TabTopBar';

afterEach(cleanup);

// BRIEF-091 — jsdom's CSS parser doesn't support env(), so a rendered-style
// assertion can't see this property (it silently drops the declaration).
// Static text scan of the source is the only reliable check here.

const SOURCE = fs.readFileSync(path.join(__dirname, 'TabTopBar.tsx'), 'utf8');

describe('TabTopBar — safe-area top padding (BRIEF-091)', () => {
  it('sticky container declares paddingTop: calc(12px + env(safe-area-inset-top, 0px)) — additive, not a replacement of the original 12px (BRIEF-091-FIX)', () => {
    expect(SOURCE).toContain("paddingTop: 'calc(12px + env(safe-area-inset-top, 0px))'");
  });

  it('background/blur are unchanged (not made opaque)', () => {
    expect(SOURCE).toContain('rgba(250,248,244,0.92)');
    expect(SOURCE).toContain('blur(8px)');
  });
});

describe('TabTopBar — title prop (BRIEF-094F)', () => {
  it('title given: renders an h1 with that text, inside the sticky box', () => {
    render(<TabTopBar title="People" />);

    const h1 = screen.getByRole('heading', { level: 1, name: 'People' });
    let el: HTMLElement | null = h1;
    let stickyAncestor: HTMLElement | null = null;
    while (el) {
      if (getComputedStyle(el).position === 'sticky') { stickyAncestor = el; break; }
      el = el.parentElement;
    }
    expect(stickyAncestor).not.toBeNull();
  });

  it('no title: no h1 is rendered (matches pre-094F markup — regression guard)', () => {
    render(<TabTopBar />);
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });
});
