'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getProfile } from '@/lib/store';
import { TabBar } from '@/components/TabBar';

/**
 * Back arrow that navigates to /settings when a profile exists,
 * or / (landing) otherwise. Starts at '/' on both server and client
 * to avoid hydration mismatch, then resolves after mount.
 */
export function SmartBackLink() {
  const [href, setHref] = useState('/');

  useEffect(() => {
    if (getProfile() !== null) setHref('/settings');
  }, []);

  return (
    <Link
      href={href}
      aria-label="Back"
      style={{
        display: 'flex',
        alignItems: 'center',
        color: 'var(--c-ink)',
        textDecoration: 'none',
      }}
    >
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none">
        <path
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19 12H5M12 19l-7-7 7-7"
        />
      </svg>
    </Link>
  );
}

/**
 * Renders the global TabBar only when a user profile exists.
 * Shows nothing until after mount to avoid hydration mismatch.
 */
export function ConditionalTabBar() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (getProfile() !== null) setShow(true);
  }, []);

  if (!show) return null;
  return <TabBar />;
}
