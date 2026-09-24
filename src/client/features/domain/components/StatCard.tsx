import { Card, CardContent } from "@/client/components/ui/card";
export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-semibold">{value}</p>
        {hint ? (
          <p className="text-xs text-muted-foreground/70">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
