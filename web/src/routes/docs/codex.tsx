import { createFileRoute, redirect } from "@tanstack/react-router";

// Short URL for the Codex guide. 302, not 301: the guide may move here later,
// and a cached permanent redirect would then loop.
export const Route = createFileRoute("/docs/codex")({
  beforeLoad: () => {
    throw redirect({
      to: "/docs/$",
      params: { _splat: "codex-plugin" },
      statusCode: 302,
    });
  },
});
