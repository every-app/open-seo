import { useMutation } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Table,
  TableBody,
  TableCard,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { updateTopic } from "@/serverFunctions/platformSeo";
import { formatNumber } from "../expand/ClusterCard";
import type { TopicDetail } from "./TopicDetailPage";

export function TopicKeywordsTable({
  projectId,
  topic,
  onChanged,
}: {
  projectId: string;
  topic: TopicDetail;
  onChanged: () => Promise<unknown>;
}) {
  const target = useMutation({
    mutationFn: (keyword: string) =>
      updateTopic({
        data: { projectId, topicId: topic.id, primaryKeyword: keyword },
      }),
    onSuccess: onChanged,
  });
  const totalVolume = topic.keywords.reduce(
    (sum, k) => sum + (k.searchVolume ?? 0),
    0,
  );

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        Keywords ({topic.keywords.length}) · {formatNumber(totalVolume)}{" "}
        searches/mo
      </h2>
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Keyword</TableHead>
              <TableHead className="w-24 text-right">Volume</TableHead>
              <TableHead className="w-14 text-right">KD</TableHead>
              <TableHead className="w-32 text-right">Target</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topic.keywords.map((k) => (
              <TableRow key={k.keyword}>
                <TableCell className="whitespace-normal break-words">
                  {k.keyword}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(k.searchVolume)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(k.keywordDifficulty)}
                </TableCell>
                <TableCell className="text-right">
                  {k.keyword === topic.primaryKeyword ? (
                    <Badge variant="soft">Target</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={target.isPending}
                      onClick={() => target.mutate(k.keyword)}
                    >
                      <Target />
                      Make target
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>
    </section>
  );
}
