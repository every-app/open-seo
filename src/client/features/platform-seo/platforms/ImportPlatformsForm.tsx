import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Textarea } from "@/client/components/ui/textarea";
import { importPlatforms } from "@/serverFunctions/platformSeo";
import type { PsPlatformStatus } from "@/shared/platform-seo";
import { asDecision, DECISION_ITEMS } from "./platformDecisions";

const IMPORT_ITEMS: Array<{ value: PsPlatformStatus; label: string }> = [
  ...DECISION_ITEMS,
  { value: "pending", label: "Leave type for review" },
];

const MAX_SITES = 1000;

export function ImportPlatformsForm({
  projectId,
  onDone,
}: {
  projectId: string;
  onDone: () => Promise<unknown>;
}) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<PsPlatformStatus>("parasite");
  const [affiliateProgram, setAffiliateProgram] = useState(false);
  const sites = [
    ...new Set(
      text
        .split(/[\n,]/)
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
  const importSites = useMutation({
    mutationFn: () =>
      importPlatforms({
        data: {
          projectId,
          sites: sites.slice(0, MAX_SITES),
          status,
          affiliateProgram,
        },
      }),
    onSuccess: async ({
      added,
      reviewed,
      alreadyListed,
      invalid,
      needsSection,
    }) => {
      await onDone();
      toast.success(
        [
          `Added ${added} ${added === 1 ? "site" : "sites"}.`,
          reviewed > 0 && `Marked ${reviewed} that were waiting for review.`,
          alreadyListed > 0 &&
            `${alreadyListed} were already listed and kept their status.`,
          invalid.length > 0 &&
            `Skipped ${invalid.length} that aren't sites: ${invalid
              .slice(0, 3)
              .join(", ")}${invalid.length > 3 ? "…" : ""}`,
          needsSection.length > 0 &&
            `${needsSection.join(", ")} cover${needsSection.length === 1 ? "s" : ""} a whole company: add the part you mean, like amazon.com/dp or support.google.com.`,
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (invalid.length === 0 && needsSection.length === 0) setText("");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import sites</CardTitle>
        <CardDescription>
          Paste the sites you already know, one URL or domain per line, up to{" "}
          {MAX_SITES}. Subdomains count as their platform, and sites already on
          your list keep the status you gave them.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={"https://medium.com\nsubstack.com"}
          rows={3}
          aria-label="Sites to import"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Select
            items={IMPORT_ITEMS}
            value={status}
            onValueChange={(value) => {
              const next = value === "pending" ? "pending" : asDecision(value);
              if (next) setStatus(next);
            }}
          >
            <SelectTrigger className="w-60" aria-label="Import as">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {IMPORT_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={affiliateProgram}
              onCheckedChange={(checked) => {
                setAffiliateProgram(checked);
                // Tagging affiliates shouldn't also call them parasites.
                if (checked && status === "parasite") setStatus("pending");
              }}
            />
            Affiliate programs
          </label>
          <Button
            pending={importSites.isPending}
            disabled={sites.length === 0}
            onClick={() => importSites.mutate()}
          >
            Import
          </Button>
          {sites.length > MAX_SITES ? (
            <span className="text-sm text-muted-foreground">
              Only the first {MAX_SITES} will be imported.
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
