import { SolarIcon, type IconProps } from "./SolarIcon";

export function MagniferIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      >
        <circle cx="11.5" cy="11.5" r="9.5" />
        <path d="M18.5 18.5L22 22" />
      </g>
    </SolarIcon>
  );
}
