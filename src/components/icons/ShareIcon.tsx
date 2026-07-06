import type { SVGProps } from 'react';

interface Props extends SVGProps<SVGSVGElement> {
  filled?: boolean;
}

export function ShareIcon({ filled = false, ...props }: Props) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {filled ? (
        <>
          <rect x="4" y="10" width="16" height="12" rx="2" fill="currentColor" />
          <path stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M12 15V3M8 7l4-4 4 4" />
        </>
      ) : (
        <>
          <rect x="4" y="10" width="16" height="12" rx="2" stroke="currentColor" strokeWidth={1.5} />
          <path stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" d="M12 15V3M8 7l4-4 4 4" />
        </>
      )}
    </svg>
  );
}
