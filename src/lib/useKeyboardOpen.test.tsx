// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useKeyboardOpen, useKeyboardInset } from './keyboard';

afterEach(cleanup);

class FakeVisualViewport extends EventTarget {
  height: number;
  offsetTop: number;
  constructor(height: number, offsetTop = 0) {
    super();
    this.height = height;
    this.offsetTop = offsetTop;
  }
  setHeight(height: number) {
    this.height = height;
    this.dispatchEvent(new Event('resize'));
  }
  setOffsetTop(offsetTop: number) {
    this.offsetTop = offsetTop;
    this.dispatchEvent(new Event('scroll'));
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

describe('useKeyboardInset (BRIEF-094C-FIX)', () => {
  it('computes bottomInset and topOffset from window.innerHeight vs. visualViewport height/offsetTop', () => {
    const fakeViewport = new FakeVisualViewport(500, 40);
    Object.defineProperty(window, 'visualViewport', { value: fakeViewport, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

    const { result } = renderHook(() => useKeyboardInset());

    expect(result.current).toEqual({ bottomInset: 260, topOffset: 40 });
  });

  it('falls back to {bottomInset: 0, topOffset: 0} when visualViewport is unsupported', () => {
    Object.defineProperty(window, 'visualViewport', { value: undefined, configurable: true });

    const { result } = renderHook(() => useKeyboardInset());

    expect(result.current).toEqual({ bottomInset: 0, topOffset: 0 });
  });
});
