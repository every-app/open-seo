import { SolarIcon, type IconProps } from "./SolarIcon";

export function ArrowLeftIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M20 12H4M10 18L4 12L10 6"
      />
    </SolarIcon>
  );
}
