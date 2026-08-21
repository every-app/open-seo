// ---------------------------------------------------------------------------
// Export the unified SERP abstraction and all known provider implementations.
// This barrel keeps the import paths stable for callers outside the lib.
// ---------------------------------------------------------------------------

export {
  type SerpProvider,
  type SerpLiveInput,
  type SerpLiveItem,
  serpSnapshotItemSchema,
} from "./providers/base";

export { SerperProvider } from "./providers/serper";

export { getSerpResults } from "./adapter";
