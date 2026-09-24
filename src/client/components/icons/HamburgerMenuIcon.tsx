import { SolarIcon, type IconProps } from "./SolarIcon";

export function HamburgerMenuIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      >
        <path d="M20 7L4 7" />
        <path d="M20 12L4 12" />
        <path d="M20 17L4 17" />
      </g>
    </SolarIcon>
  );
}
