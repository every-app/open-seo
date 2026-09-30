import { SolarIcon, type IconProps } from "./SolarIcon";

export function QuestionCircleIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M10.125 8.875C10.125 7.83947 10.9645 7 12 7C13.0355 7 13.875 7.83947 13.875 8.875C13.875 9.56245 13.505 10.1635 12.9534 10.4899C12.478 10.7711 12 11.1977 12 11.75V13" />
        <path strokeLinejoin="round" d="M12 16H12.0001" />
      </g>
    </SolarIcon>
  );
}
