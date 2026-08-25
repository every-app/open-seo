import { createFileRoute } from "@tanstack/react-router";

// Public verification token expected at this well-known URL by OpenAI Apps.
const OPENAI_APPS_CHALLENGE_TOKEN =
  process.env.OPENAI_APPS_CHALLENGE_TOKEN!;

export const Route = createFileRoute("/.well-known/openai-apps-challenge")({
  server: {
    handlers: {
      GET: async () => {
        return new Response(OPENAI_APPS_CHALLENGE_TOKEN, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
          },
        });
      },
    },
  },
});
