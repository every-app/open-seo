import { Info } from "lucide-react";
import { Alert, AlertDescription } from "@/client/components/ui/alert";

export function RankTrackingChangesAlert() {
  return (
    <Alert variant="info">
      <Info />
      <AlertDescription className="text-foreground">
        <p>
          <span className="font-medium">
            Rank tracking now reads every keyword several times.
          </span>{" "}
          Since September, Google has been serving incomplete results to all
          rank trackers.{" "}
          <a
            href="https://openseo.so/blogs/state-of-rank-tracking-november-2026"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-4"
          >
            Read what changed
          </a>
        </p>
      </AlertDescription>
    </Alert>
  );
}
