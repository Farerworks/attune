'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSyncSession } from '@/lib/sync';
import { getProfile } from '@/lib/store';
import { YouIcon } from './icons/YouIcon';

const SIZE = 27;

/**
 * Top-bar account avatar — doubles as the Settings entry point.
 * initial === null covers both "not signed in" and "not yet checked" (same look, no spinner).
 */
export function AccountAvatar() {
  const [initial, setInitial] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSyncSession().then(session => {
      if (cancelled || !session) return;
      const profile = getProfile();
      const source = profile?.name?.trim() || session.user?.email?.trim() || '';
      if (source) setInitial(source.charAt(0).toUpperCase());
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <Link
      href="/settings"
      aria-label="Settings"
      className="pressable"
      style={{
        width: SIZE, height: SIZE, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        textDecoration: 'none',
        background: initial ? 'var(--c-vermilion)' : 'var(--c-surface-alt)',
        color: initial ? '#fff' : 'var(--c-muted)',
        border: initial ? 'none' : '1px solid var(--c-hairline)',
      }}
    >
      {initial ? (
        <span style={{ fontFamily: 'var(--font-inter)', fontSize: 13, fontWeight: 700, lineHeight: 1 }}>
          {initial}
        </span>
      ) : (
        <YouIcon width={16} height={16} />
      )}
    </Link>
  );
}
