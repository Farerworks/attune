import { describe, it, expect } from 'vitest';
import {
  getSafetyContacts,
  detectSafetyTrigger,
  detectWithContext,
  enterSafetyState,
  routeSafetyAnswer,
  SAFETY_COPY_KO,
} from './safety';

// ── A. Contact DB ──────────────────────────────────────────────────────────────

describe('getSafetyContacts', () => {
  it('KR suicide -> includes the canonical number 109', () => {
    const contacts = getSafetyContacts('KR', 'suicide');
    expect(contacts.length).toBeGreaterThan(0);
    expect(contacts.some(c => c.value === '109')).toBe(true);
  });

  it('KR violence -> includes the canonical number 1366', () => {
    const contacts = getSafetyContacts('KR', 'violence');
    expect(contacts.length).toBeGreaterThan(0);
    expect(contacts.some(c => c.value === '1366')).toBe(true);
  });

  it('US suicide -> includes the canonical number 988', () => {
    const contacts = getSafetyContacts('US', 'suicide');
    expect(contacts.length).toBeGreaterThan(0);
    expect(contacts.some(c => c.value === '988')).toBe(true);
  });

  it('US violence -> includes the canonical number 800-799-7233', () => {
    const contacts = getSafetyContacts('US', 'violence');
    expect(contacts.length).toBeGreaterThan(0);
    expect(contacts.some(c => c.value === '800-799-7233')).toBe(true);
  });

  it('KR immediate -> includes both 112 and 119', () => {
    const contacts = getSafetyContacts('KR', 'immediate');
    const values = contacts.map(c => c.value);
    expect(values).toContain('112');
    expect(values).toContain('119');
  });

  it('US immediate -> includes 911', () => {
    const contacts = getSafetyContacts('US', 'immediate');
    expect(contacts.some(c => c.value === '911')).toBe(true);
  });

  it('unknown country -> empty array, never a guess', () => {
    expect(getSafetyContacts('JP', 'suicide')).toEqual([]);
    expect(getSafetyContacts('', 'immediate')).toEqual([]);
  });

  it('every returned contact carries the country and situation that were asked for', () => {
    const contacts = getSafetyContacts('US', 'violence');
    for (const c of contacts) {
      expect(c.country).toBe('US');
      expect(c.situation).toBe('violence');
    }
  });
});

// ── B. Trigger detection ─────────────────────────────────────────────────────

describe('detectSafetyTrigger', () => {
  it('self: positive matches (KO + EN)', () => {
    expect(detectSafetyTrigger('나 진짜 죽고 싶어')).toBe('self');
    expect(detectSafetyTrigger('I just want to die')).toBe('self');
  });

  it('other: positive matches (KO + EN)', () => {
    expect(detectSafetyTrigger('걔 진짜 죽이고 싶어')).toBe('other');
    expect(detectSafetyTrigger('I want to kill them')).toBe('other');
  });

  it('narrow: positive matches (KO + EN)', () => {
    expect(detectSafetyTrigger('진짜 미치겠다')).toBe('narrow');
    expect(detectSafetyTrigger("I'm going crazy")).toBe('narrow');
  });

  it('non-trigger: an idiom containing "죽" but no keyword substring does not fire', () => {
    expect(detectSafetyTrigger('이 라면 죽도록 맛있다')).toBeNull();
    expect(detectSafetyTrigger('오늘 날씨 좋다')).toBeNull();
  });

  it('priority: self > other when both keyword families are present in one message', () => {
    expect(detectSafetyTrigger('나도 죽고 싶고 걔도 죽이고 싶어')).toBe('self');
  });

  it('case/whitespace normalization: matches regardless of case or extra spaces', () => {
    expect(detectSafetyTrigger('I   WANT   TO   DIE')).toBe('self');
  });
});

describe('detectWithContext', () => {
  it('checks the last utterance in the window', () => {
    expect(detectWithContext(['오늘 하루 힘들었어', '나 진짜 죽고 싶어'])).toEqual({ trigger: 'self', repeated: false });
  });

  it('empty window -> no trigger', () => {
    expect(detectWithContext([])).toEqual({ trigger: null, repeated: false });
  });

  it('repeated: true when the same category appears 2+ times in the window', () => {
    const result = detectWithContext(['죽고 싶다 진짜', '오늘 밥 뭐 먹지', '아직도 죽고 싶어']);
    expect(result).toEqual({ trigger: 'self', repeated: true });
  });

  it('repeated: false when the category appears only once in the window', () => {
    const result = detectWithContext(['오늘 하루 힘들었어', '나 진짜 죽고 싶어']);
    expect(result.repeated).toBe(false);
  });
});

// ── C. Routing state machine ─────────────────────────────────────────────────

describe('enterSafetyState', () => {
  it('maps each trigger category to its S1 sub-state', () => {
    expect(enterSafetyState('self')).toBe('S1_SELF');
    expect(enterSafetyState('other')).toBe('S1_OTHER');
    expect(enterSafetyState('narrow')).toBe('S1_NARROW');
  });
});

describe('routeSafetyAnswer', () => {
  // "답하기 어려워요" is choice 3 on the self/other confirmation screens (SAFETY-SPEC 5-1/5-2).
  // It must never be routed as if it were "no" (S1_NO) — that's the one absolute rule here.
  it('"답하기 어려워요" (choice 3) routes to S2 from S1_SELF', () => {
    expect(routeSafetyAnswer('S1_SELF', 3)).toBe('S2');
  });

  it('"답하기 어려워요" (choice 3) routes to S2 from S1_OTHER', () => {
    expect(routeSafetyAnswer('S1_OTHER', 3)).toBe('S2');
  });

  it('"답하기 어려워요" is never routed to S1_NO ("아니요" 처리 절대 금지)', () => {
    expect(routeSafetyAnswer('S1_SELF', 3)).not.toBe('S1_NO');
    expect(routeSafetyAnswer('S1_OTHER', 3)).not.toBe('S1_NO');
  });

  it('S1_SELF: full 4-way mapping', () => {
    expect(routeSafetyAnswer('S1_SELF', 0)).toBe('S1_NO');
    expect(routeSafetyAnswer('S1_SELF', 1)).toBe('S2');
    expect(routeSafetyAnswer('S1_SELF', 2)).toBe('S3');
    expect(routeSafetyAnswer('S1_SELF', 3)).toBe('S2');
  });

  it('S1_OTHER: full 4-way mapping', () => {
    expect(routeSafetyAnswer('S1_OTHER', 0)).toBe('S1_NO');
    expect(routeSafetyAnswer('S1_OTHER', 1)).toBe('S2');
    expect(routeSafetyAnswer('S1_OTHER', 2)).toBe('S3');
    expect(routeSafetyAnswer('S1_OTHER', 3)).toBe('S2');
  });

  it('S1_NARROW: full 4-way mapping (0/1 -> S1_NO, 2 -> S1_SELF, 3 -> S1_OTHER)', () => {
    expect(routeSafetyAnswer('S1_NARROW', 0)).toBe('S1_NO');
    expect(routeSafetyAnswer('S1_NARROW', 1)).toBe('S1_NO');
    expect(routeSafetyAnswer('S1_NARROW', 2)).toBe('S1_SELF');
    expect(routeSafetyAnswer('S1_NARROW', 3)).toBe('S1_OTHER');
  });

  it('S3 entry: choice 2 ("위험 가능"/"구체적인 계획") reaches S3 from both self and other', () => {
    expect(routeSafetyAnswer('S1_SELF', 2)).toBe('S3');
    expect(routeSafetyAnswer('S1_OTHER', 2)).toBe('S3');
  });

  it('S1_NO re-entry: choice 0 ("관용 표현") returns to S1_NO from self', () => {
    expect(routeSafetyAnswer('S1_SELF', 0)).toBe('S1_NO');
  });
});

// ── D. Copy constants — spot-checked against SAFETY-SPEC.md ─────────────────

describe('SAFETY_COPY_KO — verbatim against SAFETY-SPEC.md', () => {
  it('5-1 confirmation question matches the spec exactly', () => {
    expect(SAFETY_COPY_KO.confirmSelf.question).toBe(
      '안전을 위해 한 가지만 확인할게요. 지금 실제로 죽고 싶거나 자신을 해칠 생각이 있나요?'
    );
  });

  it('5-6 S2 stop notice matches the spec exactly', () => {
    expect(SAFETY_COPY_KO.stopNotice).toBe(
      '이 이야기는 Attune이 다룰 수 있는 범위를 벗어나요. 관계 조언은 여기서 멈출게요. 지금 도움이 될 수 있는 곳을 알려드릴게요.'
    );
  });
});
