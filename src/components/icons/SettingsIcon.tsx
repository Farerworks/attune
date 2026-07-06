import type { SVGProps } from 'react';

interface Props extends SVGProps<SVGSVGElement> {
  filled?: boolean;
}

export function SettingsIcon({ filled = false, ...props }: Props) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      {filled ? (
        <>
          <path
            fill="currentColor"
            fillRule="evenodd"
            d="M11.08 2.34a1 1 0 011.84 0l.6 1.33a1 1 0 001.33.52l1.33-.6a1 1 0 011.22 1.22l-.6 1.33a1 1 0 00.52 1.33l1.33.6a1 1 0 010 1.84l-1.33.6a1 1 0 00-.52 1.33l.6 1.33a1 1 0 01-1.22 1.22l-1.33-.6a1 1 0 00-1.33.52l-.6 1.33a1 1 0 01-1.84 0l-.6-1.33a1 1 0 00-1.33-.52l-1.33.6a1 1 0 01-1.22-1.22l.6-1.33a1 1 0 00-.52-1.33l-1.33-.6a1 1 0 010-1.84l1.33-.6a1 1 0 00.52-1.33l-.6-1.33a1 1 0 011.22-1.22l1.33.6a1 1 0 001.33-.52l.6-1.33z"
            clipRule="evenodd"
          />
          <circle cx="12" cy="12" r="2.5" fill="var(--c-card, white)" />
        </>
      ) : (
        <>
          <path
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            d="M11.08 2.34a1 1 0 011.84 0l.6 1.33a1 1 0 001.33.52l1.33-.6a1 1 0 011.22 1.22l-.6 1.33a1 1 0 00.52 1.33l1.33.6a1 1 0 010 1.84l-1.33.6a1 1 0 00-.52 1.33l.6 1.33a1 1 0 01-1.22 1.22l-1.33-.6a1 1 0 00-1.33.52l-.6 1.33a1 1 0 01-1.84 0l-.6-1.33a1 1 0 00-1.33-.52l-1.33.6a1 1 0 01-1.22-1.22l.6-1.33a1 1 0 00-.52-1.33l-1.33-.6a1 1 0 010-1.84l1.33-.6a1 1 0 00.52-1.33l-.6-1.33a1 1 0 011.22-1.22l1.33.6a1 1 0 001.33-.52l.6-1.33z"
          />
          <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth={1.5} />
        </>
      )}
    </svg>
  );
}
