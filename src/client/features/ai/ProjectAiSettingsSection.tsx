import { AiScopeSettings } from "@/client/features/ai/AiScopeSettings";

// Project-scope AI settings override: same surface as the organization
// scope, with project-vs-organization inheritance labels and a reset
// ("Use inherited settings") action. See AiScopeSettings.
export function ProjectAiSettingsSection({ projectId }: { projectId: string }) {
  return <AiScopeSettings scope="project" projectId={projectId} />;
}