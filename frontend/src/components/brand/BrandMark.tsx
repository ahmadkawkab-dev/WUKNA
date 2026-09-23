import type { SVGProps } from 'react';

/** Three gathered pieces leave an open center; also usable as a monochrome mark. */
export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true" focusable="false" {...props}>
      <path d="M8 27C1 14 10 5 25 6C26 16 20 24 8 27Z" />
      <path d="M29 8C41 7 48 20 40 33C31 30 27 21 29 8Z" />
      <path d="M7 32C16 26 24 39 37 35C34 47 13 47 7 32Z" />
    </svg>
  );
}
