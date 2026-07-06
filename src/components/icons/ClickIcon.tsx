import type { SVGProps } from 'react';

interface Props extends SVGProps<SVGSVGElement> {
  filled?: boolean;
}

export function ClickIcon({ filled = false, ...props }: Props) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {filled ? (
        <>
          <circle cx="6" cy="12" r="3.5" fill="currentColor" />
          <circle cx="18" cy="12" r="3.5" fill="currentColor" />
          <path stroke="currentColor" strokeWidth={1.8} d="M9.5 12h5" />
        </>
      ) : (
        <>
          <circle cx="6" cy="12" r="3.5" stroke="currentColor" strokeWidth={1.5} />
          <circle cx="18" cy="12" r="3.5" stroke="currentColor" strokeWidth={1.5} />
          <path stroke="currentColor" strokeWidth={1.5} d="M9.5 12h5" />
        </>
      )}
    </svg>
  );
}
