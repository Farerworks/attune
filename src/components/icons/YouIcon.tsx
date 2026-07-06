import type { SVGProps } from 'react';

interface Props extends SVGProps<SVGSVGElement> {
  filled?: boolean;
}

export function YouIcon({ filled = false, ...props }: Props) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {filled ? (
        <>
          <circle cx="12" cy="7.5" r="4.5" fill="currentColor" />
          <path fill="currentColor" d="M3 21v-1a9 9 0 0118 0v1H3z" />
        </>
      ) : (
        <>
          <circle cx="12" cy="7.5" r="4.5" stroke="currentColor" strokeWidth={1.5} />
          <path stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" d="M3 21v-1a9 9 0 0118 0v1" />
        </>
      )}
    </svg>
  );
}
