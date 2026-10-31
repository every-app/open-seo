/**
 * What OpenSEO says when the Every App gateway holds no DataForSEO key: the
 * server's refusal (which a rank check stores and the MCP tools answer with)
 * and the setup dialog read this one sentence. The client's
 * DATAFORSEO_AUTH_FAILED copy adds "or rejected the key it holds", because
 * that code also covers DataForSEO's own 401. Plain text: ErrorState, toasts
 * and tool answers render it as is, so no backticks.
 */
export const DATAFORSEO_NOT_SET_UP_MESSAGE =
  "DataForSEO isn't set up on your Every App gateway yet. An owner or admin sets it with pnpm everyapp secret set DATAFORSEO_API_KEY.";
