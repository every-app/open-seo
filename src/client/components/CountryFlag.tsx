import { cn } from "cn";
import { getIsoCountryCode } from "@/shared/keyword-locations";

// Each flag stays its own small file, so a page only downloads the flags it
// shows. Inlining them would put every flag in the JavaScript bundle.
const FLAG_URLS = import.meta.glob<string>(
  "/node_modules/country-flag-icons/1x1/*.svg",
  { eager: true, exhaustive: true, import: "default", query: "?url&no-inline" },
);

/** A round country flag. Decorative: put the country's name beside it. */
export function CountryFlag({
  locationCode,
  className,
}: {
  locationCode: number;
  className?: string;
}) {
  const isoCode = getIsoCountryCode(locationCode).toUpperCase();

  return (
    <img
      src={FLAG_URLS[`/node_modules/country-flag-icons/1x1/${isoCode}.svg`]}
      alt=""
      width={16}
      height={16}
      loading="lazy"
      className={cn(
        "size-4 shrink-0 rounded-full ring-1 ring-foreground/10",
        className,
      )}
    />
  );
}
