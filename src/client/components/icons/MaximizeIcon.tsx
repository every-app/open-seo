import { SolarIcon, type IconProps } from "./SolarIcon";

export function MaximizeIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      >
        <path d="M9 15L2 22M2 16.1429V22H7.85714" />
        <path d="M15 9L22 2M22 7.85714V2H16.1429" />
      </g>
    </SolarIcon>
  );
}
