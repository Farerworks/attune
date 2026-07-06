import type { SVGProps } from 'react';

interface Props extends SVGProps<SVGSVGElement> {
  filled?: boolean;
}

export function WatchIcon({ filled = false, ...props }: Props) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {filled ? (
        <>
          <path
            fill="currentColor"
            d="M12 4C6.5 4 2 7.58 2 12s4.5 8 10 8 10-3.58 10-8-4.5-8-10-8z"
          />
          <circle cx="12" cy="12" r="3" fill="var(--c-card, white)" />
        </>
      ) : (
        <>
          <path
            stroke="currentColor"
            strokeWidth={1.5}
            d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"
          />
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth={1.5} />
        </>
      )}
    </svg>
  );
}
