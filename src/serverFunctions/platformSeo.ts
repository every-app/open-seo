import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "./middleware";
import { ExpandService } from "@/server/features/platform-seo/services/ExpandService";
import {
  psCreateTopicSchema,
  psProjectSchema,
  psPullSchema,
  psStartPullSchema,
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
    ExpandService.createTopicFromCluster({
      projectId: context.projectId,
      clusterId: data.clusterId,
      title: data.title,
    }),
  );
