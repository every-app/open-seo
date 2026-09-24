import { SolarIcon, type IconProps } from "./SolarIcon";

export function LogoutIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      >
        <path d="M12 20C7.58172 20 4 16.4183 4 12C4 7.58172 7.58172 4 12 4" />
        <path strokeLinejoin="round" d="M10 12H20M17 15L20 12L17 9" />
      </g>
    </SolarIcon>
  );
}
