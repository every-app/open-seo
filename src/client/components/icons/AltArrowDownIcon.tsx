import { SolarIcon, type IconProps } from "./SolarIcon";

export function AltArrowDownIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M19 9L12 15L5 9"
      />
    </SolarIcon>
  );
}
