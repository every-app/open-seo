import { SolarIcon, type IconProps } from "./SolarIcon";

export function CalendarIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      >
        <path d="M2 12C2 8.22876 2 6.34315 3.17157 5.17157C4.34315 4 6.22876 4 10 4H14C17.7712 4 19.6569 4 20.8284 5.17157C22 6.34315 22 8.22876 22 12V14C22 17.7712 22 19.6569 20.8284 20.8284C19.6569 22 17.7712 22 14 22H10C6.22876 22 4.34315 22 3.17157 20.8284C2 19.6569 2 17.7712 2 14V12Z" />
        <path d="M7 4V2.5" />
        <path d="M17 4V2.5" />
        <path d="M2.5 9H21.5" />
        <path strokeLinejoin="round" d="M17 13H17.0001" />
        <path strokeLinejoin="round" d="M12 13H12.0001" />
        <path strokeLinejoin="round" d="M7 13H7.0001" />
        <path strokeLinejoin="round" d="M17 17.0234H17.0001" />
        <path strokeLinejoin="round" d="M12 17.0234H12.0001" />
        <path strokeLinejoin="round" d="M7 17.0234H7.0001" />
      </g>
    </SolarIcon>
  );
}
