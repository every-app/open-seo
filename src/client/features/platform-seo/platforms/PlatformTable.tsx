import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, HandCoins, X } from "lucide-react";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import {
  type listPlatforms,
  setPlatformAffiliate,
  setPlatformStatus,
} from "@/serverFunctions/platformSeo";
import type { PsPlatformDecision } from "@/shared/platform-seo";
import { asDecision, DECISION_ITEMS } from "./platformDecisions";
import { platformQueryKeys } from "./platformQueryKeys";

const OTHER_ITEMS = DECISION_ITEMS.filter(
  (item) => item.value === "tool" || item.value === "sponsorship",
);

type Platform = Awaited<ReturnType<typeof listPlatforms>>["platforms"][number];

// While a fresh platform still has no AI verdict, the background pass is
// probably running: refresh until it lands.
const AI_WAIT_MS = 2 * 60 * 1000;

export function isAwaitingAi(platform: Platform) {
  return (
    platform.status === "pending" &&
    !platform.aiClassifiedAt &&
    platform.lastSeenAt !== null &&
    Date.now() - Date.parse(platform.lastSeenAt) < AI_WAIT_MS
  );
}

export function PlatformTable({
  projectId,
  rows,
}: {
  projectId: string;
  rows: Platform[];
}) {
  const queryClient = useQueryClient();
  const setStatus = useMutation({
    mutationFn: (input: { platformId: string; status: PsPlatformDecision }) =>
      setPlatformStatus({ data: { projectId, ...input } }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: platformQueryKeys.list(projectId),
      }),
  });

  const setAffiliate = useMutation({
    mutationFn: (input: { platformId: string; affiliateProgram: boolean }) =>
      setPlatformAffiliate({ data: { projectId, ...input } }),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: platformQueryKeys.list(projectId),
      }),
  });

  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Site</TableHead>
            <TableHead>AI first pass</TableHead>
            <TableHead className="w-28">Best rank</TableHead>
            <TableHead className="w-16 text-right">Seen</TableHead>
            <TableHead className="w-60 text-right">Your call</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((platform) => {
            const busy =
              setStatus.isPending &&
              setStatus.variables?.platformId === platform.id;
            return (
              <TableRow key={platform.id}>
                <TableCell className="align-top whitespace-normal">
                  <SafeExternalLink
                    url={`https://${platform.domain}`}
                    label={platform.domain}
                    className="font-medium hover:underline"
                  />
                  {platform.exampleTitle ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {platform.exampleUrl ? (
                        <SafeExternalLink
                          url={platform.exampleUrl}
                          label={platform.exampleTitle}
                          className="hover:underline"
                        />
                      ) : (
                        platform.exampleTitle
                      )}
                      {platform.exampleKeyword ? (
                        <> · for “{platform.exampleKeyword}”</>
                      ) : null}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <AiVerdict platform={platform} />
                </TableCell>
                <TableCell className="align-top tabular-nums">
                  {platform.bestPosition ? (
                    <>
                      #{platform.bestPosition}
                      <span className="text-muted-foreground">
                        {" "}
                        · page {platform.bestPosition <= 10 ? 1 : 2}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="align-top text-right tabular-nums">
                  {platform.seenCount}
                </TableCell>
                <TableCell className="align-top text-right">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      size="sm"
                      variant={
                        platform.status === "parasite" ? "default" : "outline"
                      }
                      disabled={busy || platform.status === "parasite"}
                      onClick={() =>
                        setStatus.mutate({
                          platformId: platform.id,
                          status: "parasite",
                        })
                      }
                    >
                      <Check />
                      Parasite
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        platform.status === "not_parasite"
                          ? "secondary"
                          : "outline"
                      }
                      disabled={busy || platform.status === "not_parasite"}
                      onClick={() =>
                        setStatus.mutate({
                          platformId: platform.id,
                          status: "not_parasite",
                        })
                      }
                    >
                      <X />
                      Not
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        platform.affiliateProgram ? "default" : "outline"
                      }
                      aria-pressed={platform.affiliateProgram}
                      disabled={
                        setAffiliate.isPending &&
                        setAffiliate.variables?.platformId === platform.id
                      }
                      title="Has an affiliate program"
                      onClick={() =>
                        setAffiliate.mutate({
                          platformId: platform.id,
                          affiliateProgram: !platform.affiliateProgram,
                        })
                      }
                    >
                      <HandCoins />
                      Affiliate
                    </Button>
                    <Select
                      items={OTHER_ITEMS}
                      value={
                        platform.status === "tool" ||
                        platform.status === "sponsorship"
                          ? platform.status
                          : null
                      }
                      disabled={busy}
                      onValueChange={(value) => {
                        const status = asDecision(value);
                        if (status) {
                          setStatus.mutate({ platformId: platform.id, status });
                        }
                      }}
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-28"
                        aria-label={`Other type for ${platform.domain}`}
                      >
                        <SelectValue placeholder="Other" />
                      </SelectTrigger>
                      <SelectContent>
                        {OTHER_ITEMS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableCard>
  );
}

function AiVerdict({ platform }: { platform: Platform }) {
  if (platform.source === "seed") {
    return (
      <span className="text-sm text-muted-foreground">
        Known publishing platform
      </span>
    );
  }
  if (platform.source === "import") {
    return (
      <span className="text-sm text-muted-foreground">From your list</span>
    );
  }
  if (!platform.aiVerdict) {
    return (
      <span className="text-sm text-muted-foreground">
        {isAwaitingAi(platform) ? "Reviewing…" : "Not reviewed yet"}
      </span>
    );
  }
  const abilities = [
    platform.aiCanProfile && "profile",
    platform.aiCanPost && "post",
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          variant={
            platform.aiVerdict === "parasite"
              ? "success"
              : platform.aiVerdict === "unsure"
                ? "warning"
                : "secondary"
          }
        >
          {platform.aiVerdict === "parasite"
            ? "Likely parasite"
            : platform.aiVerdict === "unsure"
              ? "Unsure"
              : "Likely not"}
        </Badge>
        {abilities.length > 0 ? (
          <span className="text-xs text-muted-foreground">
            can {abilities.join(" + ")}
          </span>
        ) : null}
      </div>
      {platform.aiReason ? (
        <p className="text-xs text-muted-foreground">{platform.aiReason}</p>
      ) : null}
    </div>
  );
}
