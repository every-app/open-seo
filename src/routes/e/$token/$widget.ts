import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { renderEmbedPage } from "@/server/features/embeds/embedRoutes";
import { EmbedWidget } from "@/shared/embeds";

// One widget on its own, sized for a dashboard tile.
export const Route = createFileRoute("/e/$token/$widget")({
  server: {
    handlers: {
      GET: ({ params, request }) => {
        const widget = z.enum(EmbedWidget).safeParse(params.widget);
        return renderEmbedPage(
          params.token,
          widget.success ? [widget.data] : [],
          request,
        );
      },
    },
  },
});
