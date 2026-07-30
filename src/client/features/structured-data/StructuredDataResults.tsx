import {
  describeLocation,
  groupFindingsBySeverity,
  SEVERITY_LABEL,
  summaryLine,
  type FeatureView,
  type FindingSeverity,
  type FindingView,
  type ValidationView,
} from "@/client/features/structured-data/structuredDataView";

const SEVERITY_DOT: Record<FindingSeverity, string> = {
  error: "bg-error",
  warning: "bg-warning",
  info: "bg-base-content/30",
};

function FeatureCard({ feature }: { feature: FeatureView }) {
  return (
    <div className="rounded-lg border border-base-300 p-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <span
          className={`size-2 shrink-0 rounded-full ${
            feature.eligible ? "bg-success" : "bg-error"
          }`}
        />
        <span className="text-sm font-medium">{feature.feature}</span>
        <span className="text-xs text-base-content/50">{feature.type}</span>
      </div>
      <p className="text-xs text-base-content/70">
        {feature.eligible
          ? "Carries every property Google documents as required."
          : `Missing required: ${feature.missingRequired.join(", ")}`}
      </p>
      {feature.missingRecommended.length > 0 && (
        <p className="text-xs text-base-content/50">
          Recommended, not present: {feature.missingRecommended.join(", ")}
        </p>
      )}
      <a
        className="link link-hover text-xs text-base-content/60 w-fit"
        href={feature.docsUrl}
        target="_blank"
        rel="noreferrer"
      >
        Google's requirements (read {feature.checkedOn})
      </a>
    </div>
  );
}

function FindingRow({
  finding,
  scriptCount,
}: {
  finding: FindingView;
  scriptCount: number;
}) {
  return (
    <li className="px-3 py-2 flex flex-col gap-0.5 border-b border-base-300/50 last:border-b-0">
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`size-1.5 shrink-0 rounded-full ${SEVERITY_DOT[finding.severity]}`}
        />
        <code className="font-mono text-base-content/70">
          {describeLocation(finding, scriptCount)}
        </code>
        <span className="text-base-content/40">{finding.code}</span>
      </div>
      <p className="text-sm text-base-content/80 wrap-break-word">
        {finding.message}
      </p>
      {finding.docsUrl && (
        <a
          className="link link-hover text-xs text-base-content/50 w-fit"
          href={finding.docsUrl}
          target="_blank"
          rel="noreferrer"
        >
          {finding.docsUrl}
        </a>
      )}
    </li>
  );
}

export function StructuredDataResults({
  result,
  source,
}: {
  result: ValidationView;
  source: string;
}) {
  if (result.scriptCount === 0) {
    return (
      <div className="rounded-lg border border-base-300 p-6 text-center">
        <p className="font-medium">No JSON-LD found</p>
        <p className="text-sm text-base-content/60 mt-1">
          {source} has no <code>application/ld+json</code> block, so there is
          nothing to validate. Microdata and RDFa are not read yet.
        </p>
      </div>
    );
  }

  const groups = groupFindingsBySeverity(result.findings);
  const unruled = result.notCheckedTypes;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium">{source}</p>
        <p className="text-xs text-base-content/60 mt-0.5">
          {summaryLine(result)}
        </p>
        {result.types.length > 0 && (
          <p className="text-xs text-base-content/50 mt-1">
            Types: {result.types.join(", ")}
          </p>
        )}
      </div>

      {result.features.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {result.features.map((feature, index) => (
            <FeatureCard
              key={`${feature.feature}-${feature.type}-${index}`}
              feature={feature}
            />
          ))}
        </div>
      )}

      {unruled.length > 0 && (
        <p className="text-xs text-base-content/70">
          <span className="font-medium">Not checked:</span> {unruled.join(", ")}
          . These types are recognised, but Google feature validation for them
          is not implemented here — so this is not a pass. Some of them do have
          Google rich results.
        </p>
      )}

      {groups.length === 0 ? (
        <div className="rounded-lg border border-success/40 bg-success/5 p-4">
          <p className="text-sm font-medium">No problems found.</p>
        </div>
      ) : (
        groups.map((group) => (
          <div key={group.severity}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-1.5">
              {SEVERITY_LABEL[group.severity]} ({group.findings.length})
            </h3>
            <ul className="rounded-lg border border-base-300 bg-base-100 overflow-hidden">
              {group.findings.map((finding, index) => (
                <FindingRow
                  key={`${finding.code}-${finding.path}-${index}`}
                  finding={finding}
                  scriptCount={result.scriptCount}
                />
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
