import { SolarIcon, type IconProps } from "./SolarIcon";

export function CheckIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M5 13L9 17L19 7"
      />
    </SolarIcon>
  );
}
