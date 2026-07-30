import { fetchAndAnalyze } from "@/server/lib/contentAnalyzer";

async function checkUrl(input: { url: string; targetKeyword?: string }) {
  return fetchAndAnalyze(input.url, { targetKeyword: input.targetKeyword });
}

export const ContentQualityService = {
  checkUrl,
} as const;
