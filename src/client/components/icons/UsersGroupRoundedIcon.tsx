import { SolarIcon, type IconProps } from "./SolarIcon";

export function UsersGroupRoundedIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      >
        <circle cx="9" cy="6" r="4" />
        <path d="M15 9C16.6569 9 18 7.65685 18 6C18 4.34315 16.6569 3 15 3" />
        <ellipse cx="9" cy="17" rx="7" ry="4" />
        <path d="M18 14C19.7542 14.3847 21 15.3589 21 16.5C21 17.5293 19.9863 18.4229 18.5 18.8704" />
      </g>
    </SolarIcon>
  );
}
