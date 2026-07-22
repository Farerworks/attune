// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useKeyboardOpen } from './keyboard';

afterEach(cleanup);

class FakeVisualViewport extends EventTarget {
  height: number;
  constructor(height: number) {
    super();
    this.height = height;
  }
  setHeight(height: number) {
    this.height = height;
    this.dispatchEvent(new Event('resize'));
  }
}

describe('useKeyboardOpen', () => {
  it('transitions from false to true when the visual viewport shrinks past the threshold', () => {
    const fakeViewport = new FakeVisualViewport(800);
    Object.defineProperty(window, 'visualViewport', { value: fakeViewport, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    const { result } = renderHook(() => useKeyboardOpen());
    expect(result.current).toBe(false);

    act(() => {
      fakeViewport.setHeight(460);
    });
    expect(result.current).toBe(true);

    act(() => {
      fakeViewport.setHeight(800);
    });
    expect(result.current).toBe(false);
  });
});
