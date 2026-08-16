// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { drawShareCard, ShareModal } from './ShareModal';
import type { Reading, BriefingData } from '@/lib/store';

interface FillTextCall { text: string; x: number; y: number; font: string; letterSpacing: string }

function makeFakeCtx() {
  const fillTextCalls: FillTextCall[] = [];
  const ctx: Record<string, unknown> = {
    fillTextCalls,
    createLinearGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => {},
    fillText: (text: string, x: number, y: number) =>
      fillTextCalls.push({ text, x, y, font: ctx.font as string, letterSpacing: ctx.letterSpacing as string }),
    measureText: (text: string) => ({ width: text.length * 10 }),
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, arcTo: () => {}, closePath: () => {},
    arc: () => {}, stroke: () => {}, fill: () => {},
    save: () => {}, restore: () => {}, translate: () => {}, rotate: () => {},
    drawImage: () => {},
    font: '', letterSpacing: '0px', fillStyle: '', strokeStyle: '', lineWidth: 0,
    textAlign: 'left', textBaseline: 'alphabetic', shadowBlur: 0, shadowColor: '', globalAlpha: 1,
  };
  return ctx as unknown as CanvasRenderingContext2D & { fillTextCalls: FillTextCall[] };
}

function makeReading(opts: { headline?: string; dynamic: BriefingData['dynamic']; situation?: string }): Reading {
  return {
    id: 'r1',
    date: '1990-01-01',
    relationship: 'friend',
    situation: opts.situation ?? 'general',
    createdAt: new Date().toISOString(),
    briefing: {
      headline: opts.headline ?? 'headline text',
      theirProfile: {
        personality:   { takeaway: '', detail: '' },
        communication: { takeaway: '', detail: '' },
        decisions:     { takeaway: '', detail: '' },
        stress:        { takeaway: '', detail: '' },
      },
      spectrums: { communication: 0, decisions: 0, pace: 0, stress: 0 },
      dynamic: opts.dynamic,
      playbook: [],
    },
  };
}

const koDynamic: BriefingData['dynamic'] = {
  resonance: 'strong-current',
  click: { takeaway: '우리는 잘 맞아요', detail: '' },
  clash: { takeaway: '', detail: '' },
  watch: { takeaway: '', detail: '' },
};

const enDynamic: BriefingData['dynamic'] = {
  resonance: 'strong-current',
  click: { takeaway: 'We click well', detail: '' },
  clash: { takeaway: '', detail: '' },
  watch: { takeaway: '', detail: '' },
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('drawShareCard — KO/EN 라벨 분기 (BRIEF-109 PART 2)', () => {
  it('1. KO takeaway → fillText에 "우리의 흐름"·"누구를 단정하는 말이 아니에요"·"사주 기반" 포함', () => {
    const ctx = makeFakeCtx();
    drawShareCard(ctx, makeReading({ dynamic: koDynamic }), null, null);

    const texts = ctx.fillTextCalls.map(c => c.text);
    expect(texts).toContain('우리의 흐름');
    expect(texts).toContain('누구를 단정하는 말이 아니에요');
    expect(texts).toContain('사주 기반');
  });

  it('2. KO → font에 "Pretendard Variable" 1회 이상 + letterSpacing=\'0px\'', () => {
    const ctx = makeFakeCtx();
    drawShareCard(ctx, makeReading({ dynamic: koDynamic }), null, null);

    const pretendardCalls = ctx.fillTextCalls.filter(c => c.font.includes('Pretendard Variable'));
    expect(pretendardCalls.length).toBeGreaterThan(0);
    for (const c of pretendardCalls) expect(c.letterSpacing).toBe('0px');
  });

  it('3. EN → "our dynamic"·"POWERED BY SAJU" 포함, "Pretendard Variable" 0회', () => {
    const ctx = makeFakeCtx();
    drawShareCard(ctx, makeReading({ dynamic: enDynamic }), null, null);

    const texts = ctx.fillTextCalls.map(c => c.text);
    expect(texts).toContain('our dynamic');
    expect(texts).toContain('POWERED BY SAJU');
    expect(ctx.fillTextCalls.some(c => c.font.includes('Pretendard Variable'))).toBe(false);
  });

  it('4. takeaway 공백 + headline 한국어 → KO 판정(fallback 체인)', () => {
    const ctx = makeFakeCtx();
    const blankDynamic: BriefingData['dynamic'] = {
      resonance: 'strong-current',
      click: { takeaway: '   ', detail: '' },
      clash: { takeaway: '', detail: '' },
      watch: { takeaway: '', detail: '' },
    };
    drawShareCard(ctx, makeReading({ dynamic: blankDynamic, headline: '이 관계는 흥미로워요' }), null, null);

    expect(ctx.fillTextCalls.map(c => c.text)).toContain('우리의 흐름');
  });

  it('5. ATTUNE은 KO/EN 양쪽 모두 그대로 그려진다', () => {
    const ctxKo = makeFakeCtx();
    drawShareCard(ctxKo, makeReading({ dynamic: koDynamic }), null, null);
    expect(ctxKo.fillTextCalls.map(c => c.text)).toContain('ATTUNE');

    const ctxEn = makeFakeCtx();
    drawShareCard(ctxEn, makeReading({ dynamic: enDynamic }), null, null);
    expect(ctxEn.fillTextCalls.map(c => c.text)).toContain('ATTUNE');
  });

  it('6. 공명 strong-current + KO → "강한 흐름"', () => {
    const ctx = makeFakeCtx();
    drawShareCard(ctx, makeReading({ dynamic: koDynamic }), null, null);

    expect(ctx.fillTextCalls.map(c => c.text)).toContain('강한 흐름');
  });
});

describe('ShareModal — KO fail-hard (BRIEF-109 PART 2 §3.2)', () => {
  it('7. KO + fonts.check가 false로 모킹되면 fillText가 호출되지 않고 dataUrl도 생성되지 않는다(기존 실패 뷰 재사용)', async () => {
    // 관문을 통과하면 drawShareCard가 canvas.getContext('2d')를 호출해 그리기 시작한다 —
    // 이 스파이가 한 번도 안 불리면 곧 fillText도 한 번도 안 불렸다는 뜻이다.
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');

    Object.defineProperty(document, 'fonts', {
      value: {
        ready: Promise.resolve(),
        load: vi.fn().mockResolvedValue([]),
        check: vi.fn().mockReturnValue(false),
      },
      configurable: true,
    });

    render(
      <ShareModal reading={makeReading({ dynamic: koDynamic })} myArchetype={null} theirArchetype={null} onClose={() => {}} />
    );

    await waitFor(() => expect(screen.getByText('Could not render card.')).toBeTruthy());
    expect(getContextSpy).not.toHaveBeenCalled();
    expect(screen.queryByAltText('Share card preview')).toBeNull();
  });
});
