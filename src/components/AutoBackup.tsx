'use client';

import { useEffect, useRef } from 'react';
import { getSyncSession, collectSnapshot, pushBackup } from '@/lib/sync';

const SESSION_CHECK_DELAY = 8_000;
const PUSH_INTERVAL = 60_000;

export function AutoBackup() {
  const lastPushedHash = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      const snap = collectSnapshot();
      if (!snap['attune.profile']) return; // empty device — never overwrite server backup
      const hash = JSON.stringify(snap);
      if (hash === lastPushedHash.current) return; // no change since last successful push

      const res = await pushBackup();
      if (res.ok) {
        lastPushedHash.current = hash;
      } else if (res.status === 401) {
        if (intervalId !== null) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }
      // other failures: leave hash untouched, next tick retries
    }

    function handleVisibilityChange() {
      if (document.hidden && intervalId !== null) {
        void tick();
      }
    }

    const timeoutId = setTimeout(() => {
      void (async () => {
        const session = await getSyncSession();
        if (cancelled || !session) return;

        void tick();
        intervalId = setInterval(() => { void tick(); }, PUSH_INTERVAL);
        document.addEventListener('visibilitychange', handleVisibilityChange);
      })();
    }, SESSION_CHECK_DELAY);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      if (intervalId !== null) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return null;
}
