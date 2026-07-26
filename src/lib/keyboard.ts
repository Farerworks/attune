'use client';

import { useEffect, useState } from 'react';

/** iOS shrinks the visual viewport (not the layout viewport) when the keyboard opens. */
const KEYBOARD_HEIGHT_THRESHOLD = 120;

/** input types that never bring up a text keyboard. */
const NON_TEXT_INPUT_TYPES = new Set([
  'checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color', 'image',
]);

export function isKeyboardOpen(viewportHeight: number, windowHeight: number): boolean {
  return windowHeight - viewportHeight > KEYBOARD_HEIGHT_THRESHOLD;
}

/** True if `el` is a text-entry element that would summon the on-screen keyboard. */
export function isTextInputElement(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLElement && (el.isContentEditable || el.contentEditable === 'true')) return true;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type.toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(type);
  }
  return false;
}

/**
 * True while the on-screen keyboard is (probably) open.
 * Two independent, OR-combined signals — either can flag it open:
 *  1. window.visualViewport shrinking past a threshold (BRIEF-085).
 *  2. A text-entry element currently holding focus (BRIEF-086) — catches iOS cases
 *     where the visual viewport heuristic under-fires. SSR-safe; each signal
 *     degrades to false independently when its underlying API is unsupported.
 */
export function useKeyboardOpen(): boolean {
  const [viewportOpen, setViewportOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;

    const update = () => setViewportOpen(isKeyboardOpen(vv.height, window.innerHeight));
    update();

    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    let blurTimer: ReturnType<typeof setTimeout> | null = null;

    const onFocusIn = (e: FocusEvent) => {
      if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
      setFocusOpen(isTextInputElement(e.target as Element | null));
    };

    const onFocusOut = () => {
      if (blurTimer) clearTimeout(blurTimer);
      // Delay the close: if focus lands on another text input within the window,
      // isTextInputElement(document.activeElement) below still reads true — no flicker.
      blurTimer = setTimeout(() => {
        setFocusOpen(isTextInputElement(document.activeElement));
        blurTimer = null;
      }, 100);
    };

    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      if (blurTimer) clearTimeout(blurTimer);
    };
  }, []);

  return viewportOpen || focusOpen;
}
