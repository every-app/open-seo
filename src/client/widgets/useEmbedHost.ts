import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { embedDataPath } from "@/shared/embeds";
import {
  widgetSnapshotSchema,
  type WidgetContext,
  type WidgetSnapshot,
} from "@/shared/mcp-contracts";
import { safeHttpUrl } from "@/shared/safe-url";
import type { WidgetHost } from "./host";

const errorSchema = z.object({ error: z.string() });

async function fetchSnapshot(
  token: string,
  context: WidgetContext,
): Promise<WidgetSnapshot> {
  const response = await fetch(embedDataPath(token), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(context),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      errorSchema.safeParse(body).data?.error ??
        "Couldn't load this widget. Refresh to try again.",
    );
  return widgetSnapshotSchema.parse(body);
}

/** A widget on an embed link: its tool calls go to the link's data endpoint. */
export function useEmbedHost(
  token: string,
  initial: WidgetContext,
): WidgetHost {
  const [snapshot, setSnapshot] = useState<WidgetSnapshot>();
  const first = useQuery({
    queryKey: ["embed", token, initial],
    queryFn: () => fetchSnapshot(token, initial),
    retry: false,
    staleTime: Infinity,
  });
  const shown = snapshot ?? first.data;
  const action = useMutation({
    mutationFn: async (context: WidgetContext) => {
      const next = await fetchSnapshot(token, context);
      // Keep the current Search Console table when a later call fails.
      if (shown?.data.ok === true && next.data.ok === false)
        throw new Error(next.text || "Could not refresh Search Console data.");
      return next;
    },
    onSuccess: setSnapshot,
  });
  return {
    snapshot: shown,
    restore: (value) => {
      setSnapshot(value);
      action.reset();
    },
    call: (context, onSuccess) => action.mutate(context, { onSuccess }),
    open: (href) => {
      const url = safeHttpUrl(href);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    },
    busy: action.isPending,
    notice: undefined,
    error: action.error?.message ?? first.error?.message,
    isConnected: true,
  };
}
