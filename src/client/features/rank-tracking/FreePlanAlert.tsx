import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { SUBSCRIBE_ROUTE } from "@/shared/billing";

export function FreePlanAlert({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="alert alert-warning text-sm py-2">
      <AlertTriangle className="size-4" />
      <span>
        We only start to track keyword positions once you{" "}
        <Link
          to={SUBSCRIBE_ROUTE}
          search={{ upgrade: true }}
          className="link font-medium"
        >
          upgrade to the paid plan
        </Link>
        .
      </span>
    </div>
  );
}
