import type { SVGProps } from 'react';

interface Props extends SVGProps<SVGSVGElement> {
  filled?: boolean;
}

export function StressIcon({ filled = false, ...props }: Props) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {filled ? (
        <>
          <path fill="currentColor" d="M12 2a10 10 0 100 20A10 10 0 0012 2z" />
          <path stroke="var(--c-card, white)" strokeWidth={1.8} strokeLinecap="round" d="M12 7v6M12 15.5h.01" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={1.5} />
          <path stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" d="M12 7v6M12 15.5h.01" />
        </>
      )}
    </svg>
  );
}
