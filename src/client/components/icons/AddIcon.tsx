import { SolarIcon, type IconProps } from "./SolarIcon";

export function AddIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      >
        <path d="M4 12L20 12" />
        <path d="M12.0204 4L12.0205 20.0003" />
      </g>
    </SolarIcon>
  );
}
