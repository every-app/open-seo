import { SolarIcon, type IconProps } from "./SolarIcon";

export function AltArrowRightIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M9 5L15 12L9 19"
      />
    </SolarIcon>
  );
}
