import type { SVGProps } from 'react';

interface Props extends SVGProps<SVGSVGElement> {
  filled?: boolean;
}

export function CommunicatesIcon({ filled = false, ...props }: Props) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {filled ? (
        <>
          <path fill="currentColor" d="M18 3H6a2 2 0 00-2 2v9a2 2 0 002 2h3l2 3 2-3h5a2 2 0 002-2V5a2 2 0 00-2-2z" />
          <path fill="currentColor" d="M4 8.5A2 2 0 002 10.5v5a2 2 0 002 2h1l1 2v-9H4z" />
        </>
      ) : (
        <>
          <path
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            d="M18 3H6a2 2 0 00-2 2v9a2 2 0 002 2h3l2 3 2-3h5a2 2 0 002-2V5a2 2 0 00-2-2z"
          />
        </>
      )}
    </svg>
  );
}
