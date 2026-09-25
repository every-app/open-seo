import { SolarIcon, type IconProps } from "./SolarIcon";

export function MinusIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
        d="M20 12L4 12"
      />
    </SolarIcon>
  );
}
