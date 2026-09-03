import { ClarityRepository } from "@/server/features/clarity/repositories/ClarityRepository";
import { getClarityInsights } from "@/server/features/clarity/services/ClarityInsightsService";
import { getClarityReport } from "@/server/features/clarity/services/ClarityReportService";
import { toClarityReportError } from "@/server/features/clarity/services/ClarityReportSupport";
import { ClarityTokenVault } from "@/server/features/clarity/services/ClarityTokenVault";
import { prepareClarityResponseForCache } from "@/server/features/clarity/services/ClarityPrivacy";
import {
  fetchClarityReport,
  type ClarityDataExportResponse,
} from "@/server/lib/clarityClient";
import { ClarityReportError } from "@/server/lib/clarityErrors";

function tokenHint(token: string): string {
  return `••••${token.slice(-4)}`;
}

async function getConnection(projectId: string) {
  const [connection, encryptionConfigured] = await Promise.all([
    ClarityRepository.getConnectionByProjectId(projectId),
    ClarityTokenVault.isConfigured(),
  ]);
  return connection
    ? {
        connected: true as const,
        encryptionConfigured,
        tokenHint: connection.tokenHint,
        connectedAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      }
    : {
        connected: false as const,
        encryptionConfigured,
        tokenHint: null,
        connectedAt: null,
        updatedAt: null,
      };
}

async function connect(input: {
  projectId: string;
  organizationId: string;
  userId: string;
  apiToken: string;
}) {
  const apiToken = input.apiToken.trim();
  if (!(await ClarityTokenVault.isConfigured())) {
    throw new ClarityReportError(
      "clarity_setup_required",
      "Set BETTER_AUTH_SECRET to at least 32 characters before connecting Microsoft Clarity.",
    );
  }
  let encryptedApiToken: string;
  try {
    // Prove encryption is configured before spending one of Clarity's ten
    // daily requests. Ciphertext stays in memory until validation succeeds.
    encryptedApiToken = await ClarityTokenVault.encrypt(apiToken);
  } catch (error) {
    throw toClarityReportError(error);
  }

  let overview: ClarityDataExportResponse;
  try {
    overview = prepareClarityResponseForCache(
      await fetchClarityReport({ apiToken, numOfDays: 3 }),
    );
  } catch (error) {
    throw toClarityReportError(error);
  }

  const fetchedAt = new Date().toISOString();
  try {
    await ClarityRepository.upsertConnectionWithOverview({
      projectId: input.projectId,
      organizationId: input.organizationId,
      encryptedApiToken,
      tokenHint: tokenHint(apiToken),
      connectedByUserId: input.userId,
      responseJson: JSON.stringify(overview),
      fetchedAt,
    });
  } catch (error) {
    throw toClarityReportError(error);
  }
  return { connected: true as const, tokenHint: tokenHint(apiToken) };
}

async function disconnect(projectId: string): Promise<void> {
  await ClarityRepository.disconnect(projectId);
}

export const ClarityService = {
  getConnection,
  connect,
  disconnect,
  getReport: getClarityReport,
  getInsights: getClarityInsights,
};
