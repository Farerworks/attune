import type { SVGProps } from 'react';

interface Props extends SVGProps<SVGSVGElement> {
  filled?: boolean;
}

export function DecidesIcon({ filled = false, ...props }: Props) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {filled ? (
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M14 2L4 14h7.5L9 22l11-12h-7.5L14 2z"
          clipRule="evenodd"
        />
      ) : (
        <path
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M13 2L3 13h8l-2 9 12-12h-8l2-8z"
        />
      )}
    </svg>
  );
}
