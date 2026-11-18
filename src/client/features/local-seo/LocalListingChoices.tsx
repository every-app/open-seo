import { useEffect, useRef } from "react";
import { Star } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/client/components/ui/radio-group";
import type { lookupLocalBusiness } from "@/serverFunctions/local-seo";

export type Listing = Awaited<ReturnType<typeof lookupLocalBusiness>>[number];

/** The Google Maps listings a lookup found, numbered like their map pins, to
 *  pick the user's own branch of a chain. */
export function LocalListingChoices({
  listings,
  selected,
  onSelectedChange,
}: {
  listings: Listing[];
  selected: number;
  onSelectedChange: (index: number) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  // A pin picked on the map brings its listing into view.
  useEffect(() => {
    list.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        {listings.length} listings match your search.
      </p>
      <RadioGroup
        ref={list}
        aria-label="Google Maps listings"
        value={selected}
        onValueChange={(value) => onSelectedChange(Number(value))}
        className="max-h-80 overflow-y-auto"
      >
        {listings.map((listing, index) => (
          <label
            key={listing.business.cid ?? listing.business.placeId ?? index}
            data-index={index}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 transition-colors hover:bg-muted/50 has-data-checked:border-primary has-data-checked:bg-primary/5"
          >
            <RadioGroupItem value={index} className="mt-0.5" />
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-medium">
                <span className="text-muted-foreground">{index + 1}.</span>{" "}
                {listing.business.title}
              </p>
              <p className="text-sm text-muted-foreground">
                {listing.business.address ?? "No public address"}
              </p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                {listing.rating != null && (
                  <>
                    <Star className="size-3 fill-current" />
                    {listing.rating} · {(listing.reviews ?? 0).toLocaleString()}{" "}
                    reviews
                    {listing.category && " · "}
                  </>
                )}
                {listing.category}
              </p>
            </div>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}
