import { describe, it, expect } from 'vitest';
import { friendlyError, isKoreanText } from './errorCopy';

describe('isKoreanText', () => {
  it('한글이 섞인 문장이면 true', () => {
    expect(isKoreanText('은우랑 어떻게 풀까')).toBe(true);
  });

  it('영어 문장은 false', () => {
    expect(isKoreanText('how do I talk to them')).toBe(false);
  });

  it('빈 문자열은 false', () => {
    expect(isKoreanText('')).toBe(false);
  });

  it('한글 없이 영문/숫자만이면 false', () => {
    expect(isKoreanText('ATTUNE 123')).toBe(false);
  });
});

describe('friendlyError — EN (3번째 인자 미전달, 기존 문구 그대로)', () => {
  it('status === null', () => {
    expect(friendlyError(null)).toBe("Can't reach Attune — check your connection and try again.");
  });

  it('429 + retryAfterMinutes > 0', () => {
    expect(friendlyError(429, 7)).toBe('Attune needs a breather — try again in about 7 minutes.');
  });

  it('429 + 값 없음', () => {
    expect(friendlyError(429)).toBe("You're moving faster than Attune can think — try again in a minute.");
  });

  it('>= 500', () => {
    expect(friendlyError(500)).toBe("Attune couldn't finish that thought — try again in a moment.");
  });

  it('그 밖', () => {
    expect(friendlyError(400)).toBe('Something went wrong — try again in a moment.');
  });
});

describe('friendlyError — KO (3번째 인자 true, §2.1③ 표와 정확히 일치)', () => {
  it('status === null', () => {
    expect(friendlyError(null, undefined, true)).toBe('Attune에 연결할 수 없어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
  });

  it('429 + retryAfterMinutes > 0', () => {
    expect(friendlyError(429, 7, true)).toBe('Attune도 잠시 숨을 고를게요. 약 7분 후 다시 시도해 주세요.');
  });

  it('429 + 값 없음', () => {
    expect(friendlyError(429, undefined, true)).toBe('Attune이 생각하는 것보다 조금 빠르게 움직이고 있어요. 1분 후 다시 시도해 주세요.');
  });

  it('>= 500', () => {
    expect(friendlyError(500, undefined, true)).toBe('Attune이 생각을 마무리하지 못했어요. 잠시 후 다시 시도해 주세요.');
  });

  it('그 밖', () => {
    expect(friendlyError(400, undefined, true)).toBe('문제가 발생했어요. 잠시 후 다시 시도해 주세요.');
  });
});

it('friendlyError(429, 7, true) — 보간된 분 수(7)가 문자열에 포함된다', () => {
  expect(friendlyError(429, 7, true)).toContain('7');
});

it('회귀 가드: friendlyError(500, undefined, false) === friendlyError(500)', () => {
  expect(friendlyError(500, undefined, false)).toBe(friendlyError(500));
});
