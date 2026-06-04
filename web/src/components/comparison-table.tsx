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

const COLUMNS: Column[] = [
  { name: "OpenSEO", highlight: true },
  { name: "DIY open-source repos" },
  { name: "Data-pipeline tools" },
];

const ROWS: { label: string; cells: Cell[] }[] = [
  {
    label: "Setup",
    cells: [
      { text: "Simple, guided onboarding", tone: "positive" },
      { text: "~30 min in the Google Cloud console" },
      { text: "Account + connector setup" },
    ],
  },
  {
    label: "Google Cloud project",
    cells: [
      { text: "Not needed", tone: "positive" },
      { text: "Required", tone: "negative" },
      { text: "Usually not needed", tone: "positive" },
    ],
  },
  {
    label: "Price",
    cells: [
      { text: "Free, no credits", tone: "positive" },
      { text: "Free (your time + your own quota)" },
      { text: "Paid or limited free tier", tone: "negative" },
    ],
  },
  {
    label: "Read-only and safe",
    cells: [
      { text: "webmasters.readonly", tone: "positive", code: true },
      { text: "Depends on the scopes you grant" },
      { text: "Varies" },
    ],
  },
  {
    label: "Built for SEO",
    cells: [
      {
        text: "Also does keyword, rank, and backlink research",
        tone: "positive",
      },
      { text: "Search Console only", tone: "negative" },
      { text: "Reporting and analytics focus" },
    ],
  },
  {
    label: "Self-host option",
    cells: [
      { text: "Yes", tone: "positive" },
      { text: "Yes", tone: "positive" },
      { text: "No", tone: "negative" },
    ],
  },
];

export function ComparisonTable() {
  return (
    <div className="not-prose my-8">
      <div className="overflow-x-auto rounded-xl border border-neutral-200">
        <table className="w-full min-w-[680px] border-collapse text-left">
          <thead>
            <tr>
              <td className="w-[22%] p-4" />
              {COLUMNS.map((col) => (
                <th
                  key={col.name}
                  scope="col"
                  className={`p-4 align-bottom text-sm font-semibold ${
                    col.highlight
                      ? "border-x border-neutral-200 bg-neutral-50 text-neutral-950"
                      : "text-neutral-900"
                  }`}
                >
                  <span className="block">{col.name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  className="border-t border-neutral-200 p-4 align-top text-sm font-medium text-neutral-500"
                >
                  {row.label}
                </th>
                {row.cells.map((cell, i) => {
                  const highlight = COLUMNS[i]?.highlight;
                  return (
                    <td
                      key={COLUMNS[i]?.name ?? i}
                      className={`border-t border-neutral-200 p-4 align-top text-sm ${
                        highlight ? "border-x bg-neutral-50" : ""
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
          tone === "negative" ? "text-neutral-300" : "text-neutral-900"
        }`}
      >
        <ToneIcon tone={tone} />
      </span>
      <span className={`leading-snug ${textClass}`}>
        {cell.code ? (
          <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] text-neutral-800">
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
