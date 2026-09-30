import { SolarIcon, type IconProps } from "./SolarIcon";

export function ArrowUpIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M12 20L12 4M6 10L12 4L18 10"
      />
    </SolarIcon>
  );
}
