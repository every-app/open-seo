type Tone = "positive" | "negative" | "neutral";

type Cell = {
  text: string;
  tone?: Tone;
  code?: boolean;
};

type Column = {
  name: string;
  highlight?: boolean;
};

export type ComparisonTableProps = {
  columns: Column[];
  rows: { label: string; cells: Cell[] }[];
};

export function ComparisonTable({ columns, rows }: ComparisonTableProps) {
  return (
    <div className="not-prose my-8">
      <div className="overflow-x-auto rounded-xl border border-[var(--color-border-subtle)] bg-white">
        <table
          className={`w-full border-collapse text-left ${
            columns.length > 2 ? "min-w-[680px]" : "min-w-[520px]"
          }`}
        >
          <thead>
            <tr>
              <td className="w-[22%] p-4" />
              {columns.map((col) => (
                <th
                  key={col.name}
                  scope="col"
                  className={`p-4 align-bottom text-sm font-semibold ${
                    col.highlight
                      ? "border-x border-[var(--color-border-subtle)] bg-[#fbfaf8] text-neutral-950"
                      : "text-neutral-900"
                  }`}
                >
                  <span className="block">{col.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  className="border-t border-[var(--color-border-subtle)] p-4 align-top text-sm font-medium text-[var(--color-brand-muted)]"
                >
                  {row.label}
                </th>
                {row.cells.map((cell, i) => {
                  const highlight = columns[i]?.highlight;
                  return (
                    <td
                      key={columns[i]?.name ?? i}
                      className={`border-t border-[var(--color-border-subtle)] p-4 align-top text-sm ${
                        highlight
                          ? "border-x border-[var(--color-border-subtle)] bg-[#fbfaf8]"
                          : ""
                      }`}
                    >
                      <CellContent cell={cell} highlight={highlight} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CellContent({ cell, highlight }: { cell: Cell; highlight?: boolean }) {
  const tone = cell.tone ?? "neutral";
  const textClass =
    tone === "negative"
      ? "text-neutral-400"
      : highlight && tone === "positive"
        ? "font-medium text-neutral-900"
        : "text-neutral-700";

  return (
    <div className="flex items-start gap-2.5">
      <span
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center ${
          tone === "negative"
            ? "text-neutral-300"
            : "text-[var(--color-brand-accent)]"
        }`}
      >
        <ToneIcon tone={tone} />
      </span>
      <span className={`leading-snug ${textClass}`}>
        {cell.code ? (
          <code className="rounded bg-[#ebe4da] px-1.5 py-0.5 font-mono text-[0.85em] text-neutral-800">
            {cell.text}
          </code>
        ) : (
          cell.text
        )}
      </span>
    </div>
  );
}

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === "positive") {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path
          d="M13.5 4.5 6.5 11.5 3 8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (tone === "negative") {
    return (
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className="h-4 w-4"
        aria-hidden="true"
      >
        <path
          d="M4 8h8"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return null;
}
