import { describe, it, expect } from 'vitest';
import { drawShareCard } from './ShareModal';
import type { Reading } from '@/lib/store';

// Minimal fake CanvasRenderingContext2D — records every `.font` assignment so we
// can assert which font string was used for the quote, without needing a real
// canvas implementation (not available in the vitest 'node' environment).
function makeFakeCtx() {
  const fontCalls: string[] = [];
  const ctx = {
    fontCalls,
    createLinearGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => {},
    fillText: () => {},
    measureText: (text: string) => ({ width: text.length * 10 }),
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    beginPath: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arcTo: () => {},
    closePath: () => {},
    drawImage: () => {},
    set font(v: string) { fontCalls.push(v); },
    get font() { return fontCalls[fontCalls.length - 1] ?? ''; },
    fillStyle: '', strokeStyle: '', lineWidth: 0,
    textBaseline: 'alphabetic', textAlign: 'left',
    letterSpacing: '0px', shadowBlur: 0,
  };
  return ctx as unknown as CanvasRenderingContext2D & { fontCalls: string[] };
}

const EMPTY_INSIGHT = { takeaway: '', detail: '' };

function makeReading(quoteTakeaway: string): Reading {
  return {
    id: 'r1',
    name: 'Sam',
    date: '1988-03-02',
    time: '09:00',
    relationship: 'Friend',
    situation: '',
    createdAt: new Date().toISOString(),
    briefing: {
      headline: 'x',
      theirProfile: {
        personality: EMPTY_INSIGHT, communication: EMPTY_INSIGHT,
        decisions: EMPTY_INSIGHT, stress: EMPTY_INSIGHT,
      },
      spectrums: { communication: 0, decisions: 0, pace: 0, stress: 0 },
      dynamic: {
        resonance: 'mixed-signals',
        click: { takeaway: quoteTakeaway, detail: '' },
        clash: EMPTY_INSIGHT,
        watch: EMPTY_INSIGHT,
      },
      playbook: [],
    },
    // myChart/themChart intentionally omitted — skips the background-radar canvas path, unrelated to this test.
  };
}

describe('drawShareCard — quote font, Korean vs English (BRIEF-093B)', () => {
  it('a Korean quote uses upright Gowun Batang, never italic Fraunces', () => {
    const ctx = makeFakeCtx();
    drawShareCard(ctx, makeReading('오늘은 유독 조용한 하루였어요'), null, null);

    const quoteFont = ctx.fontCalls.find(f => f.includes('Gowun Batang') || f.includes('italic'));
    expect(quoteFont).toBe('400 57px "Gowun Batang"');
    expect(ctx.fontCalls.some(f => f.includes('italic'))).toBe(false);
  });

  it('an English quote keeps the real italic Fraunces face', () => {
    const ctx = makeFakeCtx();
    drawShareCard(ctx, makeReading('A quiet resolve forms today.'), null, null);

    expect(ctx.fontCalls).toContain('italic 57px Fraunces');
    expect(ctx.fontCalls.some(f => f.includes('Gowun Batang'))).toBe(false);
  });
});
