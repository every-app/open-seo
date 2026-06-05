import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/guides/$")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/blogs/$",
      params: { _splat: params._splat },
      statusCode: 301,
    });
  },
});
