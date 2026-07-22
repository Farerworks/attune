import { describe, it, expect } from 'vitest';
import { isKeyboardOpen } from './keyboard';

describe('isKeyboardOpen', () => {
  it('keyboard closed — viewport matches window height', () => {
    expect(isKeyboardOpen(800, 800)).toBe(false);
  });

  it('keyboard open — viewport shrunk well past the threshold', () => {
    expect(isKeyboardOpen(460, 800)).toBe(true);
  });

  it('boundary: a gap just at the threshold (120) is not "open"', () => {
    expect(isKeyboardOpen(680, 800)).toBe(false);
  });

  it('boundary: a gap just past the threshold (121) is "open"', () => {
    expect(isKeyboardOpen(679, 800)).toBe(true);
  });

  it('small, non-keyboard gaps (e.g. browser chrome) stay closed', () => {
    expect(isKeyboardOpen(770, 800)).toBe(false);
  });
});
