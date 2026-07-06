export const metadata = { title: 'Ask — Attune' };

export default function AskPage() {
  return (
    <div
      style={{
        minHeight: '100%',
        background: 'var(--c-paper)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-fraunces)',
          fontSize: 20,
          lineHeight: 1.4,
          color: 'var(--c-muted)',
          maxWidth: 260,
        }}
      >
        Read someone first — then we&apos;ll talk.
      </p>
    </div>
  );
}
