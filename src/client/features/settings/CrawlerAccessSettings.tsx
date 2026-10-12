import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  CrawlerAccessForm,
  crawlerCredentialsQueryKey,
} from "@/client/features/crawler-access/CrawlerAccessForm";
import {
  deleteCrawlerCredential,
  listCrawlerCredentials,
} from "@/serverFunctions/crawlerAccess";
import { isCrawlerAccessExpired } from "@/shared/crawler-access";
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
import { SectionHeader } from "@/client/components/PageHeader";

const formatDate = (value: string) => new Date(value).toLocaleDateString();

/**
 * Shopify crawler-access signatures saved on this project. The audit crawler
 * replays them per host, and other projects in the organization that audit
 * the same host pick them up too.
 */
export function CrawlerAccessSettings({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);

  const credentialsQuery = useQuery({
    queryKey: crawlerCredentialsQueryKey,
    queryFn: () => listCrawlerCredentials(),
    select: (rows) => rows.filter((row) => row.projectId === projectId),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCrawlerCredential({ data: { id } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: crawlerCredentialsQueryKey,
      });
      toast.success("Crawler access removed");
    },
  });

  const credentials = credentialsQuery.data ?? [];

  return (
    <section className="space-y-3">
      <SectionHeader title="Crawler access" />
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-sm">Let the audit crawler through Shopify</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Paste the signature you created in Shopify admin under Online Store
            &rarr; Preferences &rarr; Crawler access. Every audit of that domain
            in your organization sends it with each request.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAdding((value) => !value)}
        >
          {isAdding ? "Cancel" : "Add signature"}
        </Button>
      </div>

      {isAdding && (
        <div className="rounded-lg border border-border bg-card p-4">
          <CrawlerAccessForm
            projectId={projectId}
            initialHost=""
            onSaved={() => setIsAdding(false)}
          />
        </div>
      )}

      {credentialsQuery.isError ? (
        <p className="text-sm text-destructive">
          We couldn't load your crawler access.
        </p>
      ) : credentials.length > 0 ? (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Domain</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {credentials.map((credential) => (
                <TableRow key={credential.id}>
                  <TableCell className="font-mono">{credential.host}</TableCell>
                  <TableCell className="text-muted-foreground">
                    Shopify signature
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(credential.createdAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {credential.expiresAt
                      ? formatDate(credential.expiresAt)
                      : "Unknown"}
                    {isCrawlerAccessExpired(credential.expiresAt) && (
                      <span className="ml-2 text-destructive">Expired</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Remove crawler access for ${credential.host}`}
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(credential.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      ) : null}
    </section>
  );
}
