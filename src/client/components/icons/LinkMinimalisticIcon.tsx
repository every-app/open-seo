import { SolarIcon, type IconProps } from "./SolarIcon";

export function LinkMinimalisticIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      >
        <path d="M8.99991 11.9999H14.9999" />
        <path d="M9 18H8C4.68629 18 2 15.3137 2 12C2 8.68629 4.68629 6 8 6H9" />
        <path d="M15 6H16C19.3137 6 22 8.68629 22 12C22 15.3137 19.3137 18 16 18H15" />
      </g>
    </SolarIcon>
  );
}
