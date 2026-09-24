import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { SUBSCRIBE_ROUTE } from "@/shared/billing";

import { Alert, AlertDescription } from "@/client/components/ui/alert";
export function FreePlanAlert({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <Alert variant="warning" className="text-sm py-2">
      <AlertTriangle className="size-4" />
      <AlertDescription>
        We only start to track keyword positions once you{" "}
        <Link
          to={SUBSCRIBE_ROUTE}
          search={{ upgrade: true }}
          className="underline underline-offset-4 font-medium"
        >
          upgrade to the paid plan
        </Link>
        .
      </AlertDescription>
    </Alert>
  );
}
