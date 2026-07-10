'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PeopleIcon } from './icons/PeopleIcon';
import { AskIcon } from './icons/AskIcon';
import { PlusIcon } from './icons/PlusIcon';
import { YouIcon } from './icons/YouIcon';
import { SettingsIcon } from './icons/SettingsIcon';

interface TabItem {
  href: string;
  label: string;
  icon: (filled: boolean) => ReactNode;
}

const TABS: TabItem[] = [
  {
    href: '/people',
    label: 'People',
    icon: (f) => <PeopleIcon filled={f} width={24} height={24} />,
  },
  {
    href: '/ask',
    label: 'Ask',
    icon: (f) => <AskIcon filled={f} width={24} height={24} />,
  },
  {
    href: '/you',
    label: 'You',
    icon: (f) => <YouIcon filled={f} width={24} height={24} />,
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: (f) => <SettingsIcon filled={f} width={24} height={24} />,
  },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        margin: '0 auto',
        width: '100%',
        maxWidth: 480,
        height: 'calc(var(--tab-bar-height) + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        background: 'var(--c-card)',
        borderTop: '1px solid var(--c-hairline)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'stretch',
      }}
    >
      {/* First two tabs: People, Ask */}
      {TABS.slice(0, 2).map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              color: active ? 'var(--c-ink)' : 'var(--c-muted)',
              textDecoration: 'none',
            }}
          >
            {tab.icon(active)}
            <span
              style={{
                fontFamily: 'var(--font-space-mono)',
                fontSize: 9,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                lineHeight: 1,
              }}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}

      {/* Center FAB — New Reading */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Link
          href="/new"
          aria-label="New reading"
          style={{
            width: 46,
            height: 46,
            borderRadius: '50%',
            background: 'var(--c-vermilion)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            textDecoration: 'none',
            boxShadow: '0 2px 12px rgba(196,80,46,0.35)',
            flexShrink: 0,
          }}
        >
          <PlusIcon width={22} height={22} />
        </Link>
      </div>

      {/* Last two tabs: You, Settings */}
      {TABS.slice(2).map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 3,
              color: active ? 'var(--c-ink)' : 'var(--c-muted)',
              textDecoration: 'none',
            }}
          >
            {tab.icon(active)}
            <span
              style={{
                fontFamily: 'var(--font-space-mono)',
                fontSize: 9,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                lineHeight: 1,
              }}
            >
              {tab.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
