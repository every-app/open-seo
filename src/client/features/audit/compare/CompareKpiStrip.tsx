import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import type { CompareKpis } from "@/server/features/audit/services/AuditCompareService";

type KpiKey = keyof CompareKpis;

type KpiDef = {
  key: KpiKey;
  label: string;
  lowerIsBetter?: boolean;
  format?: (value: number | null) => string;
  lighthouseOnly?: boolean;
};

const KPI_DEFS: KpiDef[] = [
  { key: "pagesCrawled", label: "Pages crawled" },
  { key: "issuesTotal", label: "Issues found", lowerIsBetter: true },
  { key: "issuesCritical", label: "Critical issues", lowerIsBetter: true },
  { key: "issuesWarning", label: "Warnings", lowerIsBetter: true },
  { key: "issuesInfo", label: "Info issues", lowerIsBetter: true },
  {
    key: "averageResponseMs",
    label: "Avg response",
    lowerIsBetter: true,
    format: (value) => `${value ?? 0}ms`,
  },
  {
    key: "lighthouseTests",
    label: "Lighthouse tests",
    lighthouseOnly: true,
  },
  {
    key: "avgPerformance",
    label: "Avg Lighthouse perf",
    lighthouseOnly: true,
    format: (value) => (value == null ? "—" : String(value)),
  },
  {
    key: "avgSeo",
    label: "Avg Lighthouse SEO",
    lighthouseOnly: true,
    format: (value) => (value == null ? "—" : String(value)),
  },
  {
    key: "avgAccessibility",
    label: "Avg Lighthouse a11y",
    lighthouseOnly: true,
    format: (value) => (value == null ? "—" : String(value)),
  },
  {
    key: "lighthouseFailures",
    label: "Lighthouse failures",
    lowerIsBetter: true,
    lighthouseOnly: true,
  },
];

export function CompareKpiStrip({
  previous,
  latest,
  hasLighthouse,
}: {
  previous: CompareKpis;
  latest: CompareKpis;
  hasLighthouse: boolean;
}) {
  const defs = KPI_DEFS.filter((def) => !def.lighthouseOnly || hasLighthouse);

  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>KPI</TableHead>
            <TableHead className="text-right">Previous</TableHead>
            <TableHead className="text-right">Latest</TableHead>
            <TableHead className="text-right">Change</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {defs.map((def) => {
            const prevValue = previous[def.key];
            const latestValue = latest[def.key];
            const format =
              def.format ??
              ((value: number | null) => (value == null ? "—" : String(value)));
            const delta =
              typeof prevValue === "number" && typeof latestValue === "number"
                ? latestValue - prevValue
                : null;

            return (
              <TableRow key={def.key}>
                <TableCell className="font-medium">{def.label}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {format(prevValue)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-semibold">
                  {format(latestValue)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  <Delta
                    delta={delta}
                    lowerIsBetter={def.lowerIsBetter === true}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableCard>
  );
}

function Delta({
  delta,
  lowerIsBetter,
}: {
  delta: number | null;
  lowerIsBetter: boolean;
}) {
  if (delta == null || delta === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  const sign = delta > 0 ? "+" : "";
  return (
    <span className={improved ? "text-success" : "text-destructive"}>
      {sign}
      {delta}
    </span>
  );
}
