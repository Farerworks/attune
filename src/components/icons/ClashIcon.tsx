import type { SVGProps } from 'react';

interface Props extends SVGProps<SVGSVGElement> {
  filled?: boolean;
}

export function ClashIcon({ filled = false, ...props }: Props) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {filled ? (
        <>
          <circle cx="12" cy="12" r="10" fill="currentColor" />
          <path stroke="var(--c-card, white)" strokeWidth={2} strokeLinecap="round" d="M8 8l8 8M16 8l-8 8" />
        </>
      ) : (
        <path stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" d="M8 8l8 8M16 8l-8 8" />
      )}
    </svg>
  );
}
