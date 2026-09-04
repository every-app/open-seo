import {
  cloudflareAnalyticsClient,
  type CloudflareAnalyticsClient,
  type CloudflareGraphqlResult,
} from "./CloudflareAnalyticsClient";
import {
  CloudflareAnalyticsError,
  CLOUDFLARE_MAX_RETRY_AFTER_SECONDS,
} from "./CloudflareAnalyticsError";
import {
  CloudflareAnalyticsRepository,
  type CloudflareAnalyticsConnection,
} from "./CloudflareAnalyticsRepository";
import { CloudflareCredentialVault } from "./CloudflareCredentialVault";
import {
  boundedErrors,
  crawlerResult,
  securityResult,
  trafficResult,
  unavailableResult,
} from "./results";
import type {
  CloudflareCapabilities,
  CloudflareCrawlerResult,
  CloudflareSecurityResult,
  CloudflareTrafficResult,
} from "./schemas";
import { CLOUDFLARE_TRANSIENT_CAPABILITY_PREFIX } from "@/shared/cloudflare-analytics";

type Repository = typeof CloudflareAnalyticsRepository;
type Vault = typeof CloudflareCredentialVault;

type Dependencies = {
  client: CloudflareAnalyticsClient;
  repository: Repository;
  vault: Vault;
  now: () => Date;
};

const defaults: Dependencies = {
  client: cloudflareAnalyticsClient,
  repository: CloudflareAnalyticsRepository,
  vault: CloudflareCredentialVault,
  now: () => new Date(),
};

const unavailableCapability = (reason: string) => ({
  available: false,
  reason,
});
const transientCapability = (reason: string) =>
  unavailableCapability(`${CLOUDFLARE_TRANSIENT_CAPABILITY_PREFIX}${reason}`);

function isTransientCapability(
  storedCapability: CloudflareCapabilities[keyof CloudflareCapabilities],
) {
  return (
    storedCapability.reason?.startsWith(
      CLOUDFLARE_TRANSIENT_CAPABILITY_PREFIX,
    ) ?? false
  );
}

const EMPTY_CLOUDFLARE_CAPABILITIES: CloudflareCapabilities = {
  traffic: unavailableCapability("not_connected"),
  securityEvents: unavailableCapability("not_connected"),
  crawlerAccess: unavailableCapability("not_connected"),
};

function capability<T>(
  result: CloudflareGraphqlResult<T>,
  present: (data: T) => boolean,
) {
  const available = result.data !== null && present(result.data);
  return {
    available,
    reason:
      !available && result.errors.length > 0
        ? `${CLOUDFLARE_TRANSIENT_CAPABILITY_PREFIX}provider_graphql_error`
        : result.errors.length > 0
          ? boundedErrors(result.errors).join("; ")
          : available
            ? null
            : `${CLOUDFLARE_TRANSIENT_CAPABILITY_PREFIX}dataset_not_returned`,
  };
}

function settledCapability<T>(
  result: PromiseSettledResult<CloudflareGraphqlResult<T>>,
  present: (data: T) => boolean,
) {
  if (result.status === "fulfilled") return capability(result.value, present);
  if (!(result.reason instanceof CloudflareAnalyticsError)) {
    return transientCapability("provider_probe_failed");
  }
  return result.reason.code === "dataset_unavailable" ||
    result.reason.code === "authentication_failed"
    ? unavailableCapability(result.reason.code)
    : transientCapability(result.reason.code);
}

function errorStatus(
  error: unknown,
): "not_connected" | "rate_limited" | "unavailable" {
  if (!(error instanceof CloudflareAnalyticsError)) return "unavailable";
  if (error.code === "not_connected") return "not_connected";
  return error.code === "rate_limited" ? "rate_limited" : "unavailable";
}

function errorWarning(error: unknown): string {
  return error instanceof CloudflareAnalyticsError
    ? error.code
    : "cloudflare_request_failed";
}

function errorRetryAfterSeconds(error: unknown): number | undefined {
  if (!(error instanceof CloudflareAnalyticsError)) return undefined;
  const seconds = error.retryAfterSeconds;
  if (seconds === undefined || !Number.isFinite(seconds)) return undefined;
  return Math.min(
    CLOUDFLARE_MAX_RETRY_AFTER_SECONDS,
    Math.max(0, Math.ceil(seconds)),
  );
}

export function createCloudflareAnalyticsService(
  dependencies: Partial<Dependencies> = {},
) {
  const deps = { ...defaults, ...dependencies };

  async function getConnection(projectId: string) {
    const [connection, encryptionConfigured] = await Promise.all([
      deps.repository.getByProjectId(projectId),
      deps.vault.isConfigured(),
    ]);
    if (!connection) {
      return {
        connected: false as const,
        encryptionConfigured,
        tokenHint: null,
        zoneId: null,
        zoneLabel: null,
        capabilities: EMPTY_CLOUDFLARE_CAPABILITIES,
        connectedAt: null,
        updatedAt: null,
      };
    }
    return {
      connected: true as const,
      encryptionConfigured,
      tokenHint: connection.tokenHint,
      zoneId: connection.zoneId,
      zoneLabel: connection.zoneLabel,
      capabilities: deps.repository.capabilitiesFromConnection(connection),
      connectedAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }

  async function connect(input: {
    projectId: string;
    organizationId: string;
    userId: string;
    apiToken: string;
    zoneId: string;
    zoneLabel?: string;
  }) {
    if (!(await deps.vault.isConfigured())) {
      throw new CloudflareAnalyticsError(
        "encryption_unavailable",
        "Set BETTER_AUTH_SECRET to at least 32 characters before connecting Cloudflare Analytics.",
      );
    }
    const apiToken = input.apiToken.trim();
    const encryptedApiToken = await deps.vault.encrypt(apiToken);
    const now = deps.now();
    const probeWindow = {
      from: new Date(now.getTime() - 60 * 60 * 1_000).toISOString(),
      to: now.toISOString(),
    };
    const traffic = await deps.client.traffic({
      apiToken,
      zoneId: input.zoneId,
      ...probeWindow,
    });
    if (!traffic.data || traffic.data.viewer.zones.length !== 1) {
      throw new CloudflareAnalyticsError(
        "zone_not_accessible",
        "The token could not read Analytics for exactly one selected zone.",
        undefined,
        boundedErrors(traffic.errors),
      );
    }

    const [security, crawler] = await Promise.allSettled([
      deps.client.securityEvents({
        apiToken,
        zoneId: input.zoneId,
        ...probeWindow,
      }),
      deps.client.crawlerAccess({
        apiToken,
        zoneId: input.zoneId,
        ...probeWindow,
      }),
    ]);
    const capabilities: CloudflareCapabilities = {
      traffic: capability(traffic, (data) => data.viewer.zones.length === 1),
      securityEvents: settledCapability(
        security,
        (data) => data.viewer.zones.length === 1,
      ),
      crawlerAccess: settledCapability(
        crawler,
        (data) => data.viewer.zones.length === 1,
      ),
    };
    const savedAt = deps.now().toISOString();
    const connectionId = await deps.repository.replace({
      projectId: input.projectId,
      organizationId: input.organizationId,
      encryptedApiToken,
      tokenHint: `••••${apiToken.slice(-4)}`,
      zoneId: input.zoneId,
      zoneLabel: input.zoneLabel?.trim() || null,
      capabilities,
      connectedByUserId: input.userId,
      now: savedAt,
    });
    return { connected: true as const, connectionId, capabilities };
  }

  async function disconnect(projectId: string): Promise<void> {
    await deps.repository.disconnect(projectId);
  }

  async function requireConnection(projectId: string): Promise<{
    connection: CloudflareAnalyticsConnection;
    apiToken: string;
    capabilities: CloudflareCapabilities;
  }> {
    const connection = await deps.repository.getByProjectId(projectId);
    if (!connection) {
      throw new CloudflareAnalyticsError(
        "not_connected",
        "Cloudflare Analytics is not connected for this project.",
      );
    }
    if (!(await deps.vault.isConfigured())) {
      throw new CloudflareAnalyticsError(
        "encryption_unavailable",
        "Cloudflare Analytics credential encryption is unavailable.",
      );
    }
    let apiToken: string;
    try {
      apiToken = await deps.vault.decrypt(connection.encryptedApiToken);
    } catch {
      throw new CloudflareAnalyticsError(
        "encryption_unavailable",
        "Cloudflare Analytics credential could not be decrypted; reconnect it.",
      );
    }
    return {
      connection,
      apiToken,
      capabilities: deps.repository.capabilitiesFromConnection(connection),
    };
  }

  async function trafficHealth(input: {
    projectId: string;
    from: string;
    to: string;
  }): Promise<CloudflareTrafficResult> {
    const window = { from: input.from, to: input.to };
    try {
      const connected = await requireConnection(input.projectId);
      const result = await deps.client.traffic({
        apiToken: connected.apiToken,
        zoneId: connected.connection.zoneId,
        ...window,
      });
      return trafficResult({
        rows: result.data?.viewer.zones[0]?.httpRequestsAdaptiveGroups,
        errors: result.errors,
        window,
        capabilities: connected.capabilities,
      });
    } catch (error) {
      return unavailableResult({
        status: errorStatus(error),
        warning: errorWarning(error),
        window,
        retryAfterSeconds: errorRetryAfterSeconds(error),
      });
    }
  }

  async function securityEvents(input: {
    projectId: string;
    from: string;
    to: string;
  }): Promise<CloudflareSecurityResult> {
    const window = { from: input.from, to: input.to };
    try {
      const connected = await requireConnection(input.projectId);
      if (
        !connected.capabilities.securityEvents.available &&
        !isTransientCapability(connected.capabilities.securityEvents)
      ) {
        return unavailableResult({
          status: "unavailable",
          warning:
            connected.capabilities.securityEvents.reason ??
            "security_dataset_unavailable",
          window,
        });
      }
      const result = await deps.client.securityEvents({
        apiToken: connected.apiToken,
        zoneId: connected.connection.zoneId,
        ...window,
      });
      return securityResult({
        rows: result.data?.viewer.zones[0]?.firewallEventsAdaptiveGroups,
        errors: result.errors,
        window,
        capabilities: {
          ...connected.capabilities,
          securityEvents: capability(
            result,
            (data) => data.viewer.zones.length === 1,
          ),
        },
      });
    } catch (error) {
      return unavailableResult({
        status: errorStatus(error),
        warning: errorWarning(error),
        window,
        retryAfterSeconds: errorRetryAfterSeconds(error),
      });
    }
  }

  async function crawlerAccess(input: {
    projectId: string;
    from: string;
    to: string;
  }): Promise<CloudflareCrawlerResult> {
    const window = { from: input.from, to: input.to };
    try {
      const connected = await requireConnection(input.projectId);
      if (
        !connected.capabilities.crawlerAccess.available &&
        !isTransientCapability(connected.capabilities.crawlerAccess)
      ) {
        return unavailableResult({
          status: "unavailable",
          warning:
            connected.capabilities.crawlerAccess.reason ??
            "crawler_dataset_unavailable",
          window,
        });
      }
      const result = await deps.client.crawlerAccess({
        apiToken: connected.apiToken,
        zoneId: connected.connection.zoneId,
        ...window,
      });
      return crawlerResult({
        zone: result.data?.viewer.zones[0],
        errors: result.errors,
        window,
        capabilities: {
          ...connected.capabilities,
          crawlerAccess: capability(
            result,
            (data) => data.viewer.zones.length === 1,
          ),
        },
      });
    } catch (error) {
      return unavailableResult({
        status: errorStatus(error),
        warning: errorWarning(error),
        window,
        retryAfterSeconds: errorRetryAfterSeconds(error),
      });
    }
  }

  return {
    getConnection,
    connect,
    disconnect,
    trafficHealth,
    securityEvents,
    crawlerAccess,
  };
}

export const CloudflareAnalyticsService = createCloudflareAnalyticsService();
