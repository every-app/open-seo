import { SolarIcon, type IconProps } from "./SolarIcon";

export function CheckCircleIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      >
        <circle cx="12" cy="12" r="10" />
        <path strokeLinejoin="round" d="M8.5 12.5L10.5 14.5L15.5 9.5" />
      </g>
    </SolarIcon>
  );
}
