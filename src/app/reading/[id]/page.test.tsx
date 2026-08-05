// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Suspense, act } from 'react';
import { cleanup, render } from '@testing-library/react';
import { headlineScale } from './page';

const mockRouter = { replace: vi.fn(), push: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('headlineScale (BRIEF-093)', () => {
  it('48 chars -> lg', () => expect(headlineScale('a'.repeat(48))).toBe('lg'));
  it('49 chars -> md', () => expect(headlineScale('a'.repeat(49))).toBe('md'));
  it('a representative mid-length (66 chars) -> md', () => expect(headlineScale('a'.repeat(66))).toBe('md'));
  it('84 chars -> md', () => expect(headlineScale('a'.repeat(84))).toBe('md'));
  it('85 chars -> sm', () => expect(headlineScale('a'.repeat(85))).toBe('sm'));
  it('a representative long length (120 chars) -> sm', () => expect(headlineScale('a'.repeat(120))).toBe('sm'));
});

const EMPTY_INSIGHT = { takeaway: '', detail: '' };

function makeReading(headline: string) {
  return {
    id: 'r1',
    name: 'Sam',
    date: '1988-03-02',
    time: '09:00',
    relationship: 'Friend',
    situation: '',
    createdAt: new Date().toISOString(),
    briefing: {
      headline,
      theirProfile: {
        personality: EMPTY_INSIGHT,
        communication: EMPTY_INSIGHT,
        decisions: EMPTY_INSIGHT,
        stress: EMPTY_INSIGHT,
      },
      spectrums: { communication: 0, decisions: 0, pace: 0, stress: 0 },
      dynamic: {
        resonance: 'mixed-signals',
        click: EMPTY_INSIGHT,
        clash: EMPTY_INSIGHT,
        watch: EMPTY_INSIGHT,
      },
      playbook: [],
    },
  };
}

describe('ReadingPage — headline length-adaptive scale (BRIEF-093)', () => {
  it('a ~90-char Korean headline renders at the "sm" font size', async () => {
    const longKoHeadline = '오늘은 유독 조용한 하루였지만, 그 안에서 당신은 스스로도 몰랐던 단단한 결심을 하나 세우고 있었던 것 같습니다 정말로'; // ~57 chars — pad to ~90
    const headline = longKoHeadline + ' 그리고 그 결심은 앞으로의 관계에서 조용하지만 분명한 변화를 만들어낼 거예요';
    expect([...headline].length).toBeGreaterThanOrEqual(85);

    localStorage.setItem('attune.readings', JSON.stringify([makeReading(headline)]));

    const { default: ReadingPage } = await import('./page');
    await act(async () => {
      render(<Suspense fallback={null}><ReadingPage params={Promise.resolve({ id: 'r1' })} /></Suspense>);
      await new Promise(r => setTimeout(r, 100));
    });

    const h1 = document.querySelector('h1') as HTMLElement;
    expect(h1).toBeTruthy();
    expect(h1.style.fontSize).toBe('31px');
  });

  it('a short headline (<=48 chars) renders at the "lg" (unchanged, 44px) font size', async () => {
    const headline = 'A quiet resolve forms today.';
    localStorage.setItem('attune.readings', JSON.stringify([makeReading(headline)]));

    const { default: ReadingPage } = await import('./page');
    await act(async () => {
      render(<Suspense fallback={null}><ReadingPage params={Promise.resolve({ id: 'r1' })} /></Suspense>);
      await new Promise(r => setTimeout(r, 100));
    });

    const h1 = document.querySelector('h1') as HTMLElement;
    expect(h1).toBeTruthy();
    expect(h1.style.fontSize).toBe('44px');
  });
});
