import { SolarIcon, type IconProps } from "./SolarIcon";

export function SortVerticalIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      >
        <path d="M16 18L16 6M12 10.125L16 6L20 10.125" />
        <path d="M8 6L8 18M4 13.875L8 18L12 13.875" />
      </g>
    </SolarIcon>
  );
}
