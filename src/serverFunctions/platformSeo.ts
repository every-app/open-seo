import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "./middleware";
import { ExpandService } from "@/server/features/platform-seo/services/ExpandService";
import { PlatformDiscoveryService } from "@/server/features/platform-seo/services/PlatformDiscoveryService";
import { TopicService } from "@/server/features/platform-seo/services/TopicService";
import {
  psCreateTopicSchema,
  psFindPlatformsSchema,
  psNewTopicSchema,
  psImportPlatformsSchema,
  psOpportunitiesSchema,
  psProjectSchema,
  psSetAffiliateProgramSchema,
  psPullSchema,
  psSetPlatformStatusSchema,
  psStartPullSchema,
  psTopicSchema,
  psUpdateTopicSchema,
} from "@/types/schemas/platformSeo";

// Platform SEO (Automation Squad fork). Project access is enforced by the
// global ensureUser middleware; handlers use only the verified context ids.

export const getExpandSetup = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psProjectSchema)
  .handler(() => ExpandService.getSetup());

export const listKeywordPulls = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psProjectSchema)
  .handler(({ context }) => ExpandService.listPulls(context.projectId));

export const getKeywordPull = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psPullSchema)
  .handler(({ data, context }) =>
    ExpandService.getPullDetail(context.projectId, data.pullId),
  );

export const startKeywordPull = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psStartPullSchema)
  .handler(({ data, context }) =>
    ExpandService.startPull({
      project: context.project,
      seed: data.seed,
      seedMeaning: data.seedMeaning,
      locationCode: data.locationCode,
      languageCode: data.languageCode,
      customer: context,
    }),
  );

export const filterKeywordPull = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psPullSchema)
  .handler(({ data, context }) =>
    ExpandService.filterPull({
      project: context.project,
      pullId: data.pullId,
      customer: context,
    }),
  );

export const clusterKeywordPull = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psPullSchema)
  .handler(({ data, context }) =>
    ExpandService.clusterPull({
      project: context.project,
      pullId: data.pullId,
      customer: context,
    }),
  );

export const createTopicFromCluster = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psCreateTopicSchema)
  .handler(({ data, context }) =>
    TopicService.createTopicFromCluster({
      projectId: context.projectId,
      clusterId: data.clusterId,
      title: data.title,
    }),
  );

// ---------------------------------------------------------------------------
// Topic hub
// ---------------------------------------------------------------------------

export const listTopics = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psProjectSchema)
  .handler(({ context }) => TopicService.listTopics(context.projectId));

export const getTopic = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psTopicSchema)
  .handler(({ data, context }) =>
    TopicService.getTopic(context.projectId, data.topicId),
  );

export const createTopic = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psNewTopicSchema)
  .handler(({ data, context }) =>
    TopicService.createTopic({
      project: context.project,
      title: data.title,
      angle: data.angle,
      keywords: data.keywords,
    }),
  );

export const updateTopic = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psUpdateTopicSchema)
  .handler(({ data, context }) =>
    TopicService.updateTopic({
      projectId: context.projectId,
      topicId: data.topicId,
      title: data.title,
      angle: data.angle,
      status: data.status,
      primaryKeyword: data.primaryKeyword,
    }),
  );

export const deleteTopic = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psTopicSchema)
  .handler(({ data, context }) =>
    TopicService.deleteTopic(context.projectId, data.topicId),
  );

export const generateTopicBrief = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psTopicSchema)
  .handler(({ data, context }) =>
    TopicService.generateBrief({
      projectId: context.projectId,
      topicId: data.topicId,
      customer: context,
    }),
  );

// ---------------------------------------------------------------------------
// Platform discovery. The list belongs to the organization: every query uses
// the verified context.organizationId, never an id from the client.
// ---------------------------------------------------------------------------

export const listPlatforms = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psProjectSchema)
  .handler(({ context }) =>
    PlatformDiscoveryService.listPlatforms(context.organizationId),
  );

export const setPlatformStatus = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psSetPlatformStatusSchema)
  .handler(({ data, context }) =>
    PlatformDiscoveryService.setPlatformStatus(
      context.organizationId,
      data.platformId,
      data.status,
    ),
  );

export const importPlatforms = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psImportPlatformsSchema)
  .handler(({ data, context }) =>
    PlatformDiscoveryService.importPlatforms(context.organizationId, {
      sites: data.sites,
      status: data.status,
      affiliateProgram: data.affiliateProgram,
    }),
  );

export const setPlatformAffiliate = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psSetAffiliateProgramSchema)
  .handler(({ data, context }) =>
    PlatformDiscoveryService.setAffiliateProgram(
      context.organizationId,
      data.platformId,
      data.affiliateProgram,
    ),
  );

export const runPlatformAiPass = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psProjectSchema)
  .handler(({ context }) => PlatformDiscoveryService.runAiPass(context));

export const findPlatforms = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psFindPlatformsSchema)
  .handler(({ data, context }) => {
    const locationCode = data.locationCode ?? context.project.locationCode;
    return PlatformDiscoveryService.findPlatforms({
      customer: context,
      keywords: data.keywords,
      locationCode,
      languageCode:
        data.languageCode ??
        (locationCode === context.project.locationCode
          ? context.project.languageCode
          : "en"),
    });
  });

export const getParasiteOpportunities = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psOpportunitiesSchema)
  .handler(({ data, context }) =>
    PlatformDiscoveryService.getOpportunities({
      organizationId: context.organizationId,
      keywords: data.keywords,
      locationCode: data.locationCode,
      languageCode: data.languageCode,
    }),
  );
