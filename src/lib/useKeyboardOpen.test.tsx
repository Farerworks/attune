// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
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

describe('useKeyboardOpen — focus-based fallback (BRIEF-086)', () => {
  beforeEach(() => {
    // Keep the visualViewport heuristic inert so these tests isolate the focus signal.
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('focusing a textarea opens it; blur, then the delay elapsing, closes it', () => {
    const { result } = renderHook(() => useKeyboardOpen());
    expect(result.current).toBe(false);

    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);

    act(() => { textarea.focus(); });
    expect(result.current).toBe(true);

    act(() => { textarea.blur(); });
    expect(result.current).toBe(true); // close is deferred, not immediate

    act(() => { vi.advanceTimersByTime(150); });
    expect(result.current).toBe(false);

    textarea.remove();
  });

  it('moving focus straight from one text input to another never flickers closed', () => {
    const { result } = renderHook(() => useKeyboardOpen());

    const a = document.createElement('textarea');
    const b = document.createElement('input');
    b.type = 'text';
    document.body.appendChild(a);
    document.body.appendChild(b);

    act(() => { a.focus(); });
    expect(result.current).toBe(true);

    act(() => { b.focus(); }); // jsdom blurs `a` (focusout) then focuses `b` (focusin) synchronously
    expect(result.current).toBe(true);

    act(() => { vi.advanceTimersByTime(150); });
    expect(result.current).toBe(true); // activeElement (b) is still a text input — stayed open throughout

    a.remove();
    b.remove();
  });
});
