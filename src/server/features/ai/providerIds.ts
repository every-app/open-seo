// Pure provider-id vocabulary, safe to import from client bundles (no
// adapter/SDK/runtime-env graph). providers.ts re-exports these so server
// code keeps one import surface.

export const SUPPORTED_PROVIDERS = [
  "openrouter",
  "openai",
  "gemini",
  "anthropic",
  "openai_compatible",
  "ollama_cloud",
] as const;

export type AiProviderId = (typeof SUPPORTED_PROVIDERS)[number];

export function isSupportedProvider(id: string): id is AiProviderId {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(id);
}