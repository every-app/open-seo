import {
  AI_ENGINE_LABELS,
  aiCountryLabel,
  aiEnginesWithoutLocation,
  type AiEngine,
} from "@/shared/ai-visibility";
import {
  DEFAULT_LOCATION_CODE,
  getLanguageOptions,
  isSupportedLocationCode,
  resolveMarket,
} from "@/shared/keyword-locations";
import type { AiTrackerPatch } from "@/types/schemas/ai-visibility";
import type { ConfigurationRows } from "../repositories/AiVisibilityRepository";
import { AiVisibilityError } from "./aiVisibilityErrors";

/** Resolve and validate the tracker's market after its engines are set. */
export function applyMarket(
  rows: ConfigurationRows,
  patch: AiTrackerPatch,
  created: boolean,
  engines: AiEngine[],
) {
  let market = resolveMarket(patch, rows.tracker);
  let error = marketError(engines, market);
  // A new tracker starts in the project's market. If the caller didn't choose
  // a market and that one can't be collected, start in the US rather than
  // fail on a value the caller never sent.
  if (
    error &&
    created &&
    patch.locationCode === undefined &&
    patch.languageCode === undefined
  ) {
    market = { locationCode: DEFAULT_LOCATION_CODE, languageCode: "en" };
    error = null;
  }
  if (error) throw new AiVisibilityError("UNSUPPORTED_MARKET", error);
  rows.tracker.locationCode = market.locationCode;
  rows.tracker.languageCode = market.languageCode;
}

function marketError(
  engines: AiEngine[],
  market: { locationCode: number; languageCode: string },
): string | null {
  if (!isSupportedLocationCode(market.locationCode))
    return "Choose a locationCode from the project market country list, such as 2840 for the United States.";
  const country = aiCountryLabel(market.locationCode);
  const languages = getLanguageOptions(market.locationCode);
  if (!languages.some((l) => l.code === market.languageCode))
    return `${country} supports languageCode ${languages.map((l) => l.code).join(" or ")}. Omit languageCode to use the country's default language.`;
  const unsupported = aiEnginesWithoutLocation(engines, market.locationCode);
  if (unsupported.length)
    return `${unsupported.map((e) => AI_ENGINE_LABELS[e]).join(" and ")} cannot collect answers in ${country}. Choose another country or remove the engine.`;
  return null;
}
