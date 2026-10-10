import { Button } from "@/client/components/ui/button";
import { GoogleGlyph } from "@/client/features/gsc/GoogleGlyph";
import { BingWebmasterLogo } from "@/client/features/integrations/BingWebmasterLogo";
import type { SearchPerformanceSource } from "@/types/schemas/search-performance";

export function SearchPerformanceSourceToggle({
  value,
  onChange,
}: {
  value: SearchPerformanceSource;
  onChange: (source: SearchPerformanceSource) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Search performance source"
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted p-1"
    >
      <Button
        type="button"
        role="tab"
        aria-selected={value === "gsc"}
        variant={value === "gsc" ? "secondary" : "ghost"}
        size="sm"
        className={`h-7 gap-1.5 px-2.5 text-xs font-medium ${
          value === "gsc"
            ? "bg-background text-foreground shadow-xs"
            : "text-muted-foreground"
        }`}
        onClick={() => onChange("gsc")}
      >
        <GoogleGlyph className="size-3.5" />
        Google Search Console
      </Button>
      <Button
        type="button"
        role="tab"
        aria-selected={value === "bing"}
        variant={value === "bing" ? "secondary" : "ghost"}
        size="sm"
        className={`h-7 gap-1.5 px-2.5 text-xs font-medium ${
          value === "bing"
            ? "bg-background text-foreground shadow-xs"
            : "text-muted-foreground"
        }`}
        onClick={() => onChange("bing")}
      >
        <BingWebmasterLogo className="size-3.5" />
        Bing Webmaster
      </Button>
    </div>
  );
}
