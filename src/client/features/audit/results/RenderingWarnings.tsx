import { ShieldAlert } from "lucide-react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import type { AuditResultsData } from "@/client/features/audit/results/types";

/** Report notices about JavaScript: app shells, and pages a render missed. */
export function RenderingWarnings({ data }: { data: AuditResultsData }) {
  const rendered = data.audit.config.renderJavaScript;
  const hasShells = data.issues.some(
    (issue) => issue.issueType === "javascript-rendering-suspected",
  );
  const unreadCount = data.pages.filter(
    (page) => page.fetchClass === "error",
  ).length;

  return (
    <>
      {hasShells && (
        <Alert variant="warning">
          <ShieldAlert />
          <AlertTitle>
            Some pages may need JavaScript to show their content.
          </AlertTitle>
          <AlertDescription>
            {rendered
              ? "They were still loading after rendering, so we couldn't check them."
              : "Turn on Render JavaScript and run the audit again to check them."}
          </AlertDescription>
        </Alert>
      )}

      {rendered && unreadCount > 0 && (
        <Alert variant="warning">
          <ShieldAlert />
          <AlertTitle>
            We couldn't read {unreadCount}{" "}
            {unreadCount === 1 ? "page" : "pages"}.
          </AlertTitle>
          <AlertDescription>
            To see them, open Pages and filter Crawl result by Failed.
          </AlertDescription>
        </Alert>
      )}

      {rendered && (
        <p className="text-sm text-muted-foreground">
          JavaScript rendering was enabled for this audit.
        </p>
      )}
    </>
  );
}
