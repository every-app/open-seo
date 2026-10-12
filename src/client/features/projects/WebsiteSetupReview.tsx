import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { LoaderCircle, Plus } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  WebsiteCompetitorRow,
  type WebsiteCompetitor,
} from "./WebsiteCompetitorRow";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Card, CardContent } from "@/client/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/client/components/ui/table";
import type {
  SaveProjectWebsiteSetup,
  WebsiteResearch,
} from "@/types/schemas/projectWebsite";

export function WebsiteSetupReview({
  projectId,
  research,
  saving,
  error,
  onSave,
  onBack,
}: {
  projectId: string;
  research: WebsiteResearch;
  saving: boolean;
  error: boolean;
  onSave: (accepted: Omit<SaveProjectWebsiteSetup, "projectId">) => void;
  /** Omit when there is no earlier step to return to. */
  onBack?: () => void;
}) {
  const [competitors, setCompetitors] = useState<WebsiteCompetitor[]>(
    research.competitors.map(({ name, domain, notes }) => ({
      id: crypto.randomUUID(),
      name,
      domain,
      notes,
    })),
  );
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Card className="w-full max-w-3xl py-6 md:py-8">
      <CardContent className="px-6 md:px-8">
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            onSave({
              name: research.name,
              domain: research.domain,
              overview: research.overview,
              suggestedTopics: research.suggestedTopics,
              suggestedKeywords: research.suggestedKeywords,
              competitors: competitors.map(({ name, domain, notes }) => ({
                name,
                domain,
                notes,
              })),
            });
          }}
        >
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {research.preserveCompetitors
                ? "Complete project setup"
                : "Edit competitors"}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              You can edit your{" "}
              <Link
                to="/p/$projectId/context"
                params={{ projectId }}
                className="text-foreground underline underline-offset-4"
              >
                project context
              </Link>{" "}
              at any time.
            </p>
          </div>
          <fieldset disabled={saving} className="min-w-0 space-y-5">
            {research.preserveCompetitors ? (
              <p className="text-sm text-muted-foreground">
                We’ll use the competitors already saved in your project context.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Website</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {competitors.map((competitor, index) => (
                      <WebsiteCompetitorRow
                        key={competitor.id}
                        competitor={competitor}
                        index={index}
                        editing={editing === competitor.id}
                        onChange={(changed) =>
                          setCompetitors(
                            competitors.map((row) =>
                              row.id === changed.id ? changed : row,
                            ),
                          )
                        }
                        onEdit={() =>
                          setEditing(
                            editing === competitor.id ? null : competitor.id,
                          )
                        }
                        onRemove={() =>
                          setCompetitors(
                            competitors.filter(
                              (row) => row.id !== competitor.id,
                            ),
                          )
                        }
                      />
                    ))}
                    <TableRow>
                      <TableCell colSpan={3} className="text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={competitors.length >= 100}
                          onClick={() => {
                            const id = crypto.randomUUID();
                            setCompetitors([
                              ...competitors,
                              { id, name: "", domain: "", notes: "" },
                            ]);
                            setEditing(id);
                          }}
                        >
                          <Plus className="size-4" /> Add competitor
                        </Button>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>
                  We couldn’t save your project. Check the competitor names and
                  websites, then try again.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex items-center justify-between gap-3">
              {onBack ? (
                <Button type="button" variant="outline" onClick={onBack}>
                  Back
                </Button>
              ) : (
                <span />
              )}
              <Button
                type="submit"
                disabled={competitors.some(
                  (row) => !row.name.trim() || !row.domain.trim(),
                )}
              >
                {saving && <LoaderCircle className="size-4 animate-spin" />}{" "}
                Continue
              </Button>
            </div>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}
