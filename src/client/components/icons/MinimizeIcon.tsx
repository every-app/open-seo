import { SolarIcon, type IconProps } from "./SolarIcon";

export function MinimizeIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      >
        <path d="M2 22L9 15M9 20.8571V15H3.14286" />
        <path d="M22 2L15 9M15 3.14286V9H20.8571" />
      </g>
    </SolarIcon>
  );
}
