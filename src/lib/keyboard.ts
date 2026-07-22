'use client';

import { useEffect, useState } from 'react';

/** iOS shrinks the visual viewport (not the layout viewport) when the keyboard opens. */
const KEYBOARD_HEIGHT_THRESHOLD = 120;

export function isKeyboardOpen(viewportHeight: number, windowHeight: number): boolean {
  return windowHeight - viewportHeight > KEYBOARD_HEIGHT_THRESHOLD;
}

/** True while the on-screen keyboard is open, via window.visualViewport. SSR-safe; false when unsupported. */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;

    const update = () => setOpen(isKeyboardOpen(vv.height, window.innerHeight));
    update();

    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, []);

  return open;
}
