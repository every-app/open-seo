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
    <div className="card bg-base-100 border border-base-300">
      <div className="card-body p-4">
        <p className="text-xs uppercase tracking-wide text-base-content/60">
          {label}
        </p>
        <p className="text-2xl font-semibold">{value}</p>
        {hint ? <p className="text-xs text-base-content/50">{hint}</p> : null}
      </div>
    </div>
  );
}
