import type { SVGProps } from 'react';

interface Props extends SVGProps<SVGSVGElement> {
  filled?: boolean;
}

export function PersonalityIcon({ filled = false, ...props }: Props) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {filled ? (
        <path
          fill="currentColor"
          fillRule="evenodd"
          d="M12 2l2.8 6.2L22 9l-5 5.2 1.2 7L12 18l-6.2 3.2 1.2-7L2 9l7.2-.8L12 2z"
          clipRule="evenodd"
        />
      ) : (
        <path
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinejoin="round"
          d="M12 2l2.8 6.2L22 9l-5 5.2 1.2 7L12 18l-6.2 3.2 1.2-7L2 9l7.2-.8L12 2z"
        />
      )}
    </svg>
  );
}
