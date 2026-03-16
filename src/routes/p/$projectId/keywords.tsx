import { createFileRoute, redirect } from "@tanstack/react-router";
import { DEFAULT_LOCATION_CODE } from "@/client/features/keywords/locations";
import { KeywordResearchPage } from "@/client/features/keywords/page/KeywordResearchPage";
import {
  isResultLimit,
  normalizeKeywordMode,
  normalizeLegacyKeywordSearch,
  normalizeSortDir,
  normalizeSortField,
} from "@/client/features/keywords/keywordSearchParams";
import { keywordsSearchSchema } from "@/types/schemas/keywords";

export const Route = createFileRoute("/p/$projectId/keywords")({
  validateSearch: keywordsSearchSchema,
  beforeLoad: ({ params, search }) => {
    const { normalized, changed } = normalizeLegacyKeywordSearch(search);
    if (!changed) return;

    throw redirect({
      to: "/p/$projectId/keywords",
      params: { projectId: params.projectId },
      search: normalized,
      replace: true,
    });
  },
  component: KeywordResearchPageRoute,
});

function KeywordResearchPageRoute() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  const {
    q: keywordInput = "",
    loc: rawLocationCode,
    kLimit: resultLimit = 150,
    mode: keywordMode = "auto",
    sort: sortField = "searchVolume",
    order: sortDir = "desc",
  } = search;
  const locationCode = rawLocationCode ?? DEFAULT_LOCATION_CODE;

  return (
    <KeywordResearchPage
      projectId={projectId}
      keywordInput={keywordInput}
      locationCode={locationCode}
      hasExplicitLocationCode={search.loc != null}
      resultLimit={isResultLimit(resultLimit) ? resultLimit : 150}
      keywordMode={normalizeKeywordMode(keywordMode)}
      sortField={normalizeSortField(sortField)}
      sortDir={normalizeSortDir(sortDir)}
    />
  );
}
