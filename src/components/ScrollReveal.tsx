'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

interface ScrollRevealProps {
  children: ReactNode;
  delay?: number; // ms, only applied to the transition (not a setTimeout)
}

/** Fades + rises children into view once, the first time they cross the viewport. */
export function ScrollReveal({ children, delay = 0 }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mql.matches) {
      setReduced(true);
      setVisible(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const style: CSSProperties = reduced ? {} : {
    opacity: visible ? 1 : 0,
    transform: visible ? 'translateY(0)' : 'translateY(16px)',
    transition: 'opacity var(--dur-slow) var(--ease-out), transform var(--dur-spring) var(--ease-spring)',
    transitionDelay: delay ? `${delay}ms` : undefined,
  };

  return <div ref={ref} style={style}>{children}</div>;
}
