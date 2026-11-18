import { createFileRoute, redirect } from "@tanstack/react-router";

// Short URL for the Claude guide. 302, not 301: the guide may move here later,
// and a cached permanent redirect would then loop.
export const Route = createFileRoute("/docs/claude")({
  beforeLoad: () => {
    throw redirect({
      to: "/docs/$",
      params: { _splat: "claude-code-plugin" },
      statusCode: 302,
    });
  },
});
