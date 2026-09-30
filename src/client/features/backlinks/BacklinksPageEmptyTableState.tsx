export function EmptyTableState({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}
