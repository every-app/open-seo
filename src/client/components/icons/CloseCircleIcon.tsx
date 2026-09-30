import { SolarIcon, type IconProps } from "./SolarIcon";

export function CloseCircleIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M14.5 9.50002L9.5 14.5M9.49998 9.5L14.5 14.5" />
      </g>
    </SolarIcon>
  );
}
