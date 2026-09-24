import { SolarIcon, type IconProps } from "./SolarIcon";

export function AltArrowUpIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M19 15L12 9L5 15"
      />
    </SolarIcon>
  );
}
