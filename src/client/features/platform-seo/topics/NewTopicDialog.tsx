import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import { createTopic } from "@/serverFunctions/platformSeo";
import { topicQueryKeys } from "./topicQueryKeys";

const MAX_KEYWORDS = 100;

export function NewTopicDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [angle, setAngle] = useState("");
  const [keywordText, setKeywordText] = useState("");
  const keywords = [
    ...new Set(
      keywordText
        .split(/[\n,]/)
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  const tooMany = keywords.length > MAX_KEYWORDS;

  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const create = useMutation({
    mutationFn: () =>
      createTopic({
        data: {
          projectId,
          title,
          angle: angle.trim() || undefined,
          keywords,
        },
      }),
    onSuccess: async ({ topicId }) => {
      await queryClient.invalidateQueries({
        queryKey: topicQueryKeys.list(projectId),
      });
      setOpen(false);
      setTitle("");
      setAngle("");
      setKeywordText("");
      await navigate({
        to: "/p/$projectId/topics/$topicId",
        params: { projectId, topicId },
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus />
        New topic
      </DialogTrigger>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (title.trim() && keywords.length > 0 && !tooMany) {
              create.mutate();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>New topic</DialogTitle>
            <DialogDescription>
              An article you plan to write. Its keywords are measured in this
              project's market.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-topic-title">Title</Label>
            <Input
              id="new-topic-title"
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="How parasite SEO works in 2026"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-topic-angle">Angle (optional)</Label>
            <Input
              id="new-topic-angle"
              value={angle}
              maxLength={300}
              onChange={(event) => setAngle(event.target.value)}
              placeholder="A plain-English guide for small business owners"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="new-topic-keywords">Keywords</Label>
            <Textarea
              id="new-topic-keywords"
              value={keywordText}
              onChange={(event) => setKeywordText(event.target.value)}
              placeholder={"parasite seo\nwhat is parasite seo"}
              rows={4}
              required
            />
            <p
              className={
                tooMany
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
              One per line or separated by commas, up to {MAX_KEYWORDS}.
              {keywords.length > 0 ? ` ${keywords.length} entered.` : ""}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="submit"
              pending={create.isPending}
              disabled={!title.trim() || keywords.length === 0 || tooMany}
            >
              Add topic
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
