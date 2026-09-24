import { SolarIcon, type IconProps } from "./SolarIcon";

export function ArrowDownIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M12 4L12 20M6 14L12 20L18 14"
      />
    </SolarIcon>
  );
}
