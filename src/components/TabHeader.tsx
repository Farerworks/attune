import Link from 'next/link';
import { SettingsIcon } from './icons/SettingsIcon';

interface Props {
  title: string;
  showSettings?: boolean;
}

/** Shared one-line page header for the tab screens (home/people/ask/you/settings) — unifies height across tabs. */
export function TabHeader({ title, showSettings = true }: Props) {
  return (
    <header style={{
      padding: '20px 20px 12px', borderBottom: '1px solid var(--c-hairline)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <h1 className="t-h2">{title}</h1>
      {showSettings && (
        <Link href="/settings" aria-label="Settings" style={{ color: 'var(--c-muted)', display: 'flex' }}>
          <SettingsIcon />
        </Link>
      )}
    </header>
  );
}
