import { SolarIcon, type IconProps } from "./SolarIcon";

export function ClockCircleIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      >
        <circle cx="12" cy="12" r="10" />
        <path strokeLinejoin="round" d="M12 8V12L14.5 14.5" />
      </g>
    </SolarIcon>
  );
}
