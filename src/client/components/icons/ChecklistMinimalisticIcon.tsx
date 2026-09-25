import { SolarIcon, type IconProps } from "./SolarIcon";

export function ChecklistMinimalisticIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      >
        <path d="M2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12Z" />
        <path strokeLinejoin="round" d="M6 15.8L7.14286 17L10 14" />
        <path strokeLinejoin="round" d="M6 8.8L7.14286 10L10 7" />
        <path d="M13 9L18 9" />
        <path d="M13 16L18 16" />
      </g>
    </SolarIcon>
  );
}
