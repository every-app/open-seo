import { SolarIcon, type IconProps } from "./SolarIcon";

export function PlayIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
        d="M20.4086 9.35258C22.5305 10.5065 22.5305 13.4935 20.4086 14.6474L7.59662 21.6145C5.53435 22.736 3 21.2763 3 18.9671L3 5.0329C3 2.72368 5.53435 1.26402 7.59661 2.38548L20.4086 9.35258Z"
      />
    </SolarIcon>
  );
}
