import { SolarIcon, type IconProps } from "./SolarIcon";

export function ArrowRightUpIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M6 18L18 6M18 15V6H9"
      />
    </SolarIcon>
  );
}
