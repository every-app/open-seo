const GITHUB_REPO = "every-app/open-seo";
// Used if GitHub is unreachable at build time so the header never renders empty.
const FALLBACK_STAR_COUNT = "27k";

// Round to the nearest hundred and render in thousands, e.g. 3140 -> "3.1k".
function formatStarCount(count: number): string {
  if (count < 1000) return String(count);
  return `${(Math.round(count / 100) / 10).toString()}k`;
}

async function fetchGithubStarCount(): Promise<string> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: {
        Accept: "application/vnd.github+json",
        // GitHub rejects requests without a User-Agent.
        "User-Agent": "openseo-landing",
      },
    });
    if (!res.ok) return FALLBACK_STAR_COUNT;
    const data = (await res.json()) as { stargazers_count?: number };
    return typeof data.stargazers_count === "number"
      ? formatStarCount(data.stargazers_count)
      : FALLBACK_STAR_COUNT;
  } catch {
    return FALLBACK_STAR_COUNT;
  }
}

// Memoized for the duration of a build so prerendering every page with the
// site header only hits GitHub once instead of once per page.
let starCountPromise: Promise<string> | null = null;
export function loadGithubStarCount(): Promise<string> {
  starCountPromise ??= fetchGithubStarCount();
  return starCountPromise;
}
