import type { SVGProps } from 'react';

interface Props extends SVGProps<SVGSVGElement> {
  filled?: boolean;
}

export function DontIcon({ filled = false, ...props }: Props) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {filled ? (
        <>
          <circle cx="12" cy="12" r="10" fill="currentColor" />
          <path stroke="var(--c-card, white)" strokeWidth={2} strokeLinecap="round" d="M9 9l6 6M15 9l-6 6" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={1.5} />
          <path stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" d="M9 9l6 6M15 9l-6 6" />
        </>
      )}
    </svg>
  );
}
