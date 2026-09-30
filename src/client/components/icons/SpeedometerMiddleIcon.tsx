import { SolarIcon, type IconProps } from "./SolarIcon";

export function SpeedometerMiddleIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      >
        <path d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" />
        <path d="M19 19L17.5 17.5" />
        <path d="M19 5L17.5 6.5" />
        <path d="M5 19L6.5 17.5" />
        <path d="M5 5L6.5 6.5" />
        <path d="M2 12H4" />
        <path d="M19.9998 12L21.9998 12" />
        <path d="M12 4.00021L12 2.00021" />
        <path d="M15 11.9999C15 13.6567 13.6569 14.9999 12 14.9999C10.3431 14.9999 9 13.6567 9 11.9999C9 11.3696 9.43408 10.4954 9.972 9.65399C10.7764 8.39573 11.1786 7.7666 12 7.7666C12.8214 7.7666 13.2236 8.39573 14.028 9.65399C14.5659 10.4954 15 11.3696 15 11.9999Z" />
      </g>
    </SolarIcon>
  );
}
