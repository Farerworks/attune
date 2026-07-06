import type { SVGProps } from 'react';

interface Props extends SVGProps<SVGSVGElement> {
  filled?: boolean;
}

export function DoIcon({ filled = false, ...props }: Props) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {filled ? (
        <>
          <circle cx="12" cy="12" r="10" fill="currentColor" />
          <path stroke="var(--c-card, white)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M8 12l3 3 5-5" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={1.5} />
          <path stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" d="M8 12l3 3 5-5" />
        </>
      )}
    </svg>
  );
}
