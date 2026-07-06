import type { SVGProps } from 'react';

interface Props extends SVGProps<SVGSVGElement> {
  filled?: boolean;
}

export function AskIcon({ filled = false, ...props }: Props) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {filled ? (
        <path
          fill="currentColor"
          d="M20 2H4a2 2 0 00-2 2v13a2 2 0 002 2h3l2.5 3 2.5-3H20a2 2 0 002-2V4a2 2 0 00-2-2z"
        />
      ) : (
        <path
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          d="M20 2H4a2 2 0 00-2 2v13a2 2 0 002 2h3l2.5 3 2.5-3H20a2 2 0 002-2V4a2 2 0 00-2-2z"
        />
      )}
    </svg>
  );
}
