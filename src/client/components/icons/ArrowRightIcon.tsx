import { SolarIcon, type IconProps } from "./SolarIcon";

export function ArrowRightIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M4 12H20M14 18L20 12L14 6"
      />
    </SolarIcon>
  );
}
