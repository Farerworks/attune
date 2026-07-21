interface Props {
  title: string;
}

/** Shared one-line page header for the tab screens (home/people/ask/you/settings) — unifies height across tabs. */
export function TabHeader({ title }: Props) {
  return (
    <header style={{
      padding: '20px 20px 12px', borderBottom: '1px solid var(--c-hairline)',
    }}>
      <h1 className="t-h2">{title}</h1>
    </header>
  );
}
