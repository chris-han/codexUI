import type { SVGProps } from 'react';

export function IconLucideSplinePointer(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3 21c3 0 7-1 10-4" />
      <path d="M13 17c0-4 2-7 5-9" />
      <path d="M18 8V3l3 3-3 2" />
      <path d="M5 12V7l3 3-3 2" />
    </svg>
  );
}
