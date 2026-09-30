import { SolarIcon, type IconProps } from "./SolarIcon";

export function DangerCircleIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M12 7V13" />
        <path strokeLinejoin="round" d="M12 16H12.0001" />
      </g>
    </SolarIcon>
  );
}
