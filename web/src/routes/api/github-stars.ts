import { createFileRoute } from "@tanstack/react-router";

const GITHUB_REPOSITORY_URL = "https://api.github.com/repos/every-app/open-seo";
const CACHE_DURATION_SECONDS = 60 * 60;

export const Route = createFileRoute("/api/github-stars")({
  server: {
    handlers: {
      GET: async () => {
        const githubResponse = await fetch(GITHUB_REPOSITORY_URL, {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "openseo-landing",
          },
        });

        if (!githubResponse.ok) {
          return new Response(null, { status: githubResponse.status });
        }

        const data = (await githubResponse.json()) as {
          stargazers_count?: number;
        };

        if (typeof data.stargazers_count !== "number") {
          return new Response(null, { status: 502 });
        }

        return Response.json(
          { stargazers_count: data.stargazers_count },
          {
            headers: {
              "Cache-Control": "public, max-age=0, must-revalidate",
              "CDN-Cache-Control": `public, max-age=${CACHE_DURATION_SECONDS}`,
            },
          },
        );
      },
    },
  },
});
