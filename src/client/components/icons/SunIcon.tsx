import { SolarIcon, type IconProps } from "./SolarIcon";

export function SunIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      >
        <circle cx="12" cy="12" r="6" />
        <path d="M12 2V3" />
        <path d="M12 21V22" />
        <path d="M22 12L21 12" />
        <path d="M3 12L2 12" />
        <path d="M19.0708 4.92969L18.678 5.32252" />
        <path d="M5.32178 18.6777L4.92894 19.0706" />
        <path d="M19.0708 19.0703L18.678 18.6775" />
        <path d="M5.32178 5.32227L4.92894 4.92943" />
      </g>
    </SolarIcon>
  );
}
