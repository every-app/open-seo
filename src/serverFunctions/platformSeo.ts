import { createServerFn } from "@tanstack/react-start";
import { hasOrgPermission } from "@/lib/org-permissions";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { requireProjectContext } from "./middleware";
import { ExpandService } from "@/server/features/platform-seo/services/ExpandService";
import { PlatformDiscoveryService } from "@/server/features/platform-seo/services/PlatformDiscoveryService";
import { ChannelService } from "@/server/features/platform-seo/services/ChannelService";
import { TrackingService } from "@/server/features/platform-seo/services/TrackingService";
import { SyndicationService } from "@/server/features/platform-seo/services/SyndicationService";
import { ArticleService } from "@/server/features/platform-seo/services/ArticleService";
import { TopicService } from "@/server/features/platform-seo/services/TopicService";
import {
  psArticleStatusSchema,
  psCanonicalUrlSchema,
  psChannelSchema,
  psConnectDevtoSchema,
  psConnectHashnodeSchema,
  psPrepareSyndicationSchema,
  psSaveSyndicationSchema,
  psSyndicationSchema,
  psCreateTopicSchema,
  psFindPlatformsSchema,
  psNewTopicSchema,
  psImportPlatformsSchema,
  psOpportunitiesSchema,
  psProjectSchema,
  psSetAffiliateProgramSchema,
  psPullSchema,
  psSaveArticleSchema,
  psSetPlatformStatusSchema,
  psStartPullSchema,
  psStartTrackingSchema,
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
// Writing hub: one canonical article per topic
// ---------------------------------------------------------------------------

export const getArticleEditor = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psTopicSchema)
  .handler(({ data, context }) =>
    ArticleService.getEditor(context.projectId, data.topicId),
  );

export const saveArticle = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psSaveArticleSchema)
  .handler(({ data, context }) =>
    ArticleService.saveArticle({
      projectId: context.projectId,
      topicId: data.topicId,
      title: data.title,
      body: data.body,
    }),
  );

export const setArticleStatus = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psArticleStatusSchema)
  .handler(({ data, context }) =>
    ArticleService.setArticleStatus({
      projectId: context.projectId,
      topicId: data.topicId,
      status: data.status,
    }),
  );

export const draftArticle = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psTopicSchema)
  .handler(({ data, context }) =>
    ArticleService.draftArticle({
      projectId: context.projectId,
      topicId: data.topicId,
      customer: context,
    }),
  );

export const humanizeArticle = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psSaveArticleSchema)
  .handler(({ data, context }) =>
    ArticleService.humanizeArticle({
      projectId: context.projectId,
      topicId: data.topicId,
      title: data.title,
      body: data.body,
      customer: context,
    }),
  );

// ---------------------------------------------------------------------------
// Syndication. Channels belong to the organization and syndications are
// reached through both the project and the organization; tokens never leave
// the server.
// ---------------------------------------------------------------------------

const scopeOf = (context: { projectId: string; organizationId: string }) => ({
  projectId: context.projectId,
  organizationId: context.organizationId,
});

export const listChannels = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psProjectSchema)
  .handler(async ({ context }) => ({
    ...(await ChannelService.listChannels(context.organizationId)),
    // Channels are shared by the organization, like its other integrations.
    canManage: hasOrgPermission(context.role, { integration: ["manage"] }),
  }));

export const connectDevto = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psConnectDevtoSchema)
  .handler(({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return ChannelService.connectDevto(context.organizationId, data.apiKey);
  });

export const connectHashnode = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psConnectHashnodeSchema)
  .handler(({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return ChannelService.connectHashnode(
      context.organizationId,
      data.token,
      data.publicationId,
    );
  });

export const disconnectChannel = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psChannelSchema)
  .handler(({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return ChannelService.disconnect(context.organizationId, data.channelId);
  });

export const getPublishing = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psTopicSchema)
  .handler(({ data, context }) =>
    SyndicationService.getPublishing(scopeOf(context), data.topicId),
  );

export const setCanonicalUrl = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psCanonicalUrlSchema)
  .handler(({ data, context }) =>
    SyndicationService.setCanonicalUrl(
      scopeOf(context),
      data.topicId,
      data.canonicalUrl,
    ),
  );

export const prepareSyndication = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psPrepareSyndicationSchema)
  .handler(({ data, context }) =>
    SyndicationService.prepare(scopeOf(context), data.topicId, data.channelId),
  );

export const saveSyndication = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psSaveSyndicationSchema)
  .handler(({ data, context }) =>
    SyndicationService.saveEdits(scopeOf(context), data.syndicationId, {
      title: data.title,
      summary: data.summary,
      body: data.body,
      tags: data.tags,
      aiDisclosure: data.aiDisclosure,
    }),
  );

export const removeSyndication = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psSyndicationSchema)
  .handler(({ data, context }) =>
    SyndicationService.remove(scopeOf(context), data.syndicationId),
  );

export const sendSyndicationDraft = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psSyndicationSchema)
  .handler(({ data, context }) =>
    SyndicationService.sendDraft(scopeOf(context), data.syndicationId),
  );

export const publishSyndication = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psSyndicationSchema)
  .handler(({ data, context }) =>
    SyndicationService.publish(scopeOf(context), data.syndicationId),
  );

// ---------------------------------------------------------------------------
// Tracking and the pipeline dashboard
// ---------------------------------------------------------------------------

const trackingScope = (context: {
  projectId: string;
  organizationId: string;
  project: { locationCode: number; languageCode: string };
}) => ({
  projectId: context.projectId,
  organizationId: context.organizationId,
  locationCode: context.project.locationCode,
  languageCode: context.project.languageCode,
});

export const getPipeline = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psProjectSchema)
  .handler(({ context }) =>
    TrackingService.getPipeline(trackingScope(context)),
  );

export const startTrackingChecks = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psStartTrackingSchema)
  .handler(({ data, context }) =>
    TrackingService.startChecks({
      scope: trackingScope(context),
      customer: context,
      syndicationIds: data.syndicationIds,
    }),
  );

// Free: collects finished reads (task_get) and looks up AI sources.
export const collectTrackingChecks = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(psProjectSchema)
  .handler(({ context }) => TrackingService.collect(trackingScope(context)));

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
