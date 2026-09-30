import type { ComponentType, SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement>;

export type IconComponent = ComponentType<IconProps>;

// Solar linear icons draw on a 24x24 grid with currentColor strokes, so a
// Tailwind size-* class sets the size and text-* sets the colour. An icon is
// decorative unless the caller labels it.
export function SolarIcon({ children, ...props }: IconProps) {
  const labelled =
    props["aria-label"] !== undefined || props["aria-labelledby"] !== undefined;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      aria-hidden={labelled ? undefined : true}
      role={labelled ? "img" : undefined}
      {...props}
    >
      {children}
    </svg>
  );
}
