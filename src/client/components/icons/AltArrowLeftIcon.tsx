import { SolarIcon, type IconProps } from "./SolarIcon";

export function AltArrowLeftIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M15 5L9 12L15 19"
      />
    </SolarIcon>
  );
}
