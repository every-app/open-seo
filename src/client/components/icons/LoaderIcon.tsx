import { SolarIcon, type IconProps } from "./SolarIcon";

export function LoaderIcon(props: IconProps) {
  return (
    <SolarIcon {...props}>
      <path
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
        d="M14.0028 2.20061C13.3557 2.06906 12.6859 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 11.3187 21.9319 10.6532 21.802 10.0102"
      />
    </SolarIcon>
  );
}
