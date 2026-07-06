import type { SVGProps } from 'react';

interface Props extends SVGProps<SVGSVGElement> {
  filled?: boolean;
}

export function PeopleIcon({ filled = false, ...props }: Props) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {filled ? (
        <>
          <circle cx="8" cy="7" r="3.5" fill="currentColor" />
          <path fill="currentColor" d="M2 20v-1a6 6 0 0112 0v1H2z" />
          <circle cx="17.5" cy="7.5" r="2.75" fill="currentColor" />
          <path fill="currentColor" d="M14.15 13.2A7.49 7.49 0 0122 20v0h-2v-1a7.96 7.96 0 00-1.34-4.41 5.36 5.36 0 00-4.51-1.39z" />
        </>
      ) : (
        <>
          <circle cx="8" cy="7" r="3.5" stroke="currentColor" strokeWidth={1.5} />
          <path stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" d="M2 20v-1a6 6 0 0112 0v1" />
          <circle cx="17.5" cy="7.5" r="2.75" stroke="currentColor" strokeWidth={1.5} />
          <path stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" d="M15 13.6A6 6 0 0122 19v1" />
        </>
      )}
    </svg>
  );
}
