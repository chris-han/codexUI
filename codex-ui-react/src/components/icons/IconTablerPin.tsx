import type { SVGProps } from 'react';

export function IconTablerPin(props: SVGProps<SVGSVGElement>) {
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
      <path stroke="none" d="M0 0h24v24H0z" fill="none" />
      <path d="M15 4.5l-4 4l-7 7l-1 5l5 -1l7 -7l4 -4" />
      <path d="M21 5l-4.5 4.5" />
      <path d="M15 4.5l3 3" />
    </svg>
  );
}
