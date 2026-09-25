import { SolarIcon, type IconProps } from "./SolarIcon";

export function CardIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      >
        <path d="M2 12C2 8.22876 2 6.34315 3.17157 5.17157C4.34315 4 6.22876 4 10 4H14C17.7712 4 19.6569 4 20.8284 5.17157C22 6.34315 22 8.22876 22 12C22 15.7712 22 17.6569 20.8284 18.8284C19.6569 20 17.7712 20 14 20H10C6.22876 20 4.34315 20 3.17157 18.8284C2 17.6569 2 15.7712 2 12Z" />
        <path d="M10 16H6" />
        <path d="M14 16H12.5" />
        <path d="M2 10L22 10" />
      </g>
    </SolarIcon>
  );
}
