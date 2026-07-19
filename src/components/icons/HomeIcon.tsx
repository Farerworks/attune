import type { SVGProps } from 'react';

interface Props extends SVGProps<SVGSVGElement> {
  filled?: boolean;
}

export function HomeIcon({ filled = false, ...props }: Props) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {filled ? (
        <path
          fill="currentColor"
          d="M12 2.8l9 7.5V20a1 1 0 01-1 1h-4.5v-6.5h-7V21H4a1 1 0 01-1-1v-9.7l9-7.5z"
        />
      ) : (
        <>
          <path stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" d="M3 10.5L12 3l9 7.5" />
          <path stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" d="M5 9.3V20a1 1 0 001 1h4v-6.5h4V21h4a1 1 0 001-1V9.3" />
        </>
      )}
    </svg>
  );
}
