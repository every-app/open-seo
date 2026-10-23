import { createServerFn } from "@tanstack/react-start";
import { requireProjectContext } from "./middleware";
import { GoogleMapsService } from "@/server/features/local-seo/services/GoogleMapsService";
import { localProjectSchema } from "@/types/schemas/local-seo";
import { googleMapsViewportSchema } from "@/types/schemas/google-maps";

export const getLocalMapCopyright = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(localProjectSchema.extend({ viewport: googleMapsViewportSchema }))
  .handler(({ data }) => GoogleMapsService.getCopyright(data.viewport));
