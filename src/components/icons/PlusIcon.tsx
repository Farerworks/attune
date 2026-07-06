import type { SVGProps } from 'react';

interface Props extends SVGProps<SVGSVGElement> {
  filled?: boolean;
}

export function PlusIcon({ filled: _filled = false, ...props }: Props) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        d="M12 5v14M5 12h14"
      />
    </svg>
  );
}
