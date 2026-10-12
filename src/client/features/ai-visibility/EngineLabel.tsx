import { AI_ENGINE_LABELS, type AiEngine } from "@/shared/ai-visibility";
import { EngineIcon } from "./EngineIcon";

export function EngineLabel({
  engine,
  label = AI_ENGINE_LABELS[engine],
}: {
  engine: AiEngine;
  label?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap align-middle">
      <EngineIcon
        engine={engine}
        className="size-4 shrink-0"
        aria-hidden="true"
      />
      {label}
    </span>
  );
}
