import { SolarIcon, type IconProps } from "./SolarIcon";

export function TransferHorizontalIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      >
        <path d="M20 10L4 10L9.5 4" />
        <path d="M4 14L20 14L14.5 20" />
      </g>
    </SolarIcon>
  );
}
