import type { SVGProps } from 'react';

interface Props extends SVGProps<SVGSVGElement> {
  filled?: boolean;
  direction?: 'right' | 'left' | 'up' | 'down';
}

export function ChevronIcon({ filled: _filled = false, direction = 'right', style, ...props }: Props) {
  const deg = { right: 0, down: 90, left: 180, up: 270 }[direction];
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={deg ? { transform: `rotate(${deg}deg)`, ...style } : style}
      {...props}
    >
      <path
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 18l6-6-6-6"
      />
    </svg>
  );
}
