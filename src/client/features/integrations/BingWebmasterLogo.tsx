import type { SVGProps } from "react";

/** Bing Webmaster Tools mark: a rounded tile with a lowercase "b". Kept
 *  deliberately simple rather than tracing the full brand asset. */
export function BingWebmasterLogo({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={className}
      {...props}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#008373" />
      <text
        x="12"
        y="12.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize="13"
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
      >
        b
      </text>
    </svg>
  );
}
