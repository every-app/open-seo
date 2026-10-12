import { Info } from "lucide-react";
import { EngineLabel } from "./EngineLabel";
import { Checkbox } from "@/client/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip";
import { ProjectMarketFields } from "@/client/features/projects/ProjectMarketFields";
import type { ProjectMarket } from "@/client/features/projects/types";
import {
  aiEnginesWithoutLocation,
  type AiCapability,
  type AiEngine,
  type AiTrackerState,
} from "@/shared/ai-visibility";
import {
  DEFAULT_LOCATION_CODE,
  LOCATION_OPTIONS,
} from "@/shared/keyword-locations";

export type TrackerDraft = {
  locationCode: number;
  languageCode: string;
  engines: AiEngine[];
  topic: { name: string; prompts: string[] };
};

export const MAX_PROMPTS_PER_ADDITION = 5;

/**
 * The first market every engine can collect in, else US English. Keeps the
 * country valid when the engine selection changes.
 */
export function collectableMarket(
  engines: AiEngine[],
  ...markets: ProjectMarket[]
): ProjectMarket {
  return (
    markets.find(
      (market) =>
        !aiEnginesWithoutLocation(engines, market.locationCode).length,
    ) ?? { locationCode: DEFAULT_LOCATION_CODE, languageCode: "en" }
  );
}

export function TrackerTrackingFields({
  state,
  defaultMarket,
  value,
  onChange,
  disabled,
}: {
  state: AiTrackerState;
  /** The project's market, or US English. */
  defaultMarket: ProjectMarket;
  value: TrackerDraft;
  onChange: (value: TrackerDraft) => void;
  // Base UI checkboxes aren't native inputs, so a disabled <fieldset> misses them.
  disabled: boolean;
}) {
  const countryOptions = LOCATION_OPTIONS.filter(
    (option) => !aiEnginesWithoutLocation(value.engines, option.code).length,
  );
  const engineGroup = (
    title: string,
    help: string,
    capabilities: AiCapability[],
  ) => (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`About ${title.toLowerCase()}`}
                className="text-muted-foreground"
              />
            }
          >
            <Info className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{help}</TooltipContent>
        </Tooltip>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {capabilities.map((capability) => (
          <label
            key={capability.engine}
            className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 border-border"
          >
            <Checkbox
              checked={value.engines.includes(capability.engine)}
              disabled={disabled}
              onCheckedChange={(checked) => {
                const engines = checked
                  ? [...value.engines, capability.engine]
                  : value.engines.filter(
                      (engine) => engine !== capability.engine,
                    );
                onChange({
                  ...value,
                  engines,
                  ...collectableMarket(
                    engines,
                    {
                      locationCode: value.locationCode,
                      languageCode: value.languageCode,
                    },
                    defaultMarket,
                  ),
                });
              }}
            />
            <span className="text-sm font-medium">
              <EngineLabel
                engine={capability.engine}
                label={capability.label}
              />
            </span>
          </label>
        ))}
      </div>
    </div>
  );
  return (
    <section className="space-y-5">
      {engineGroup(
        "Scraped responses",
        "Answers as users see them in each AI app.",
        state.capabilities.filter((capability) => !capability.modelApi),
      )}
      {engineGroup(
        "API responses",
        "Answers from each model's API, with web search.",
        state.capabilities.filter((capability) => capability.modelApi),
      )}
      <ProjectMarketFields
        value={value}
        countryOptions={countryOptions}
        onChange={(market) => onChange({ ...value, ...market })}
      />
    </section>
  );
}
