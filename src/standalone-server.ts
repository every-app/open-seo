import { installAesKw } from "./server/standalone/aes-kw";

// celld has no AES-KW, which MCP OAuth needs. package.json lists this file
// under sideEffects so the bundler keeps this call.
installAesKw();

// Keep all workflow and object classes in the same celld deployment: celld
// does not support workflow bindings targeting another script.
export {
  default as AuditEngine,
  AuditScratchpad,
  SiteAuditWorkflow,
} from "./audit-worker";
export { LocalRankWorkflow, RankCheckWorkflow, default } from "./server";
// Same binding and class name as hosted (the SAM_CHAT binding and migrations
// in wrangler.standalone.json), with the legacy-import RPC added.
export { StandaloneSamChatAgent as SamChatAgent } from "./server/standalone/SamChatAgent";
export { AiVisibilityWorkflow } from "./server/workflows/AiVisibilityWorkflow";
