import { SolarIcon, type IconProps } from "./SolarIcon";

export function CloseIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      >
        <path d="M19.0068 5L5.00684 19" />
        <path d="M19 19L5 5" />
      </g>
    </SolarIcon>
  );
}
