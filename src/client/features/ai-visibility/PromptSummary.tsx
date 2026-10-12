import { useState } from "react";
import { sort } from "remeda";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import type { AiBrandSummary } from "@/shared/ai-visibility";
import { DomainFavicon } from "./DomainFavicon";
import { aiRate } from "./shared";

// Your brand plus the top three competitors.
const VISIBLE_BRANDS = 4;

export function PromptSummary({ summaries }: { summaries: AiBrandSummary[] }) {
  const [expanded, setExpanded] = useState(false);
  // Most-mentioned competitors first, so the collapsed table shows the ones that matter.
  const ranked = sort(
    summaries,
    (a, b) =>
      Number(b.own) - Number(a.own) ||
      b.mentions - a.mentions ||
      b.citations - a.citations,
  );
  const visible = expanded ? ranked : ranked.slice(0, VISIBLE_BRANDS);
  const hiddenCount = ranked.length - visible.length;
  return (
    <div className="overflow-hidden rounded-lg border bg-card border-border">
      <h2 className="border-b px-4 py-2 text-sm font-medium border-border">
        Brand comparison
      </h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Brand</TableHead>
            <TableHead>Mentioned</TableHead>
            <TableHead>Cited</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((brand) => (
            <TableRow key={brand.domain}>
              <TableCell>
                <span className="flex items-center gap-2">
                  <DomainFavicon domain={brand.domain} />
                  {brand.name}
                  {brand.own && (
                    <Badge variant="secondary" size="sm">
                      You
                    </Badge>
                  )}
                </span>
              </TableCell>
              <TableCell
                className="tabular-nums"
                title={`${brand.mentions} of ${brand.answers} answers`}
              >
                {aiRate(brand.mentions, brand.answers)}
                {brand.answers > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {brand.mentions} of {brand.answers}
                  </p>
                )}
              </TableCell>
              <TableCell
                className="tabular-nums"
                title={`${brand.citations} of ${brand.answers} answers`}
              >
                {aiRate(brand.citations, brand.answers)}
                {brand.answers > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {brand.citations} of {brand.answers}
                  </p>
                )}
              </TableCell>
            </TableRow>
          ))}
          {!summaries.length && (
            <TableRow>
              <TableCell colSpan={3} className="py-4 text-muted-foreground">
                No brand evidence is available for this period yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {hiddenCount > 0 && (
        <div className="border-t px-4 py-2 border-border">
          <Button
            variant="link"
            size="xs"
            className="h-auto px-0 text-muted-foreground hover:text-foreground"
            onClick={() => setExpanded(true)}
          >
            Show {hiddenCount} more
          </Button>
        </div>
      )}
    </div>
  );
}
