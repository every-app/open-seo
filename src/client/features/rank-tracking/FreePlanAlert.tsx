import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { SUBSCRIBE_ROUTE } from "@/shared/billing";

export function FreePlanAlert({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="alert alert-warning text-sm py-2">
      <AlertTriangle className="size-4" />
      <span>
        升级后即可开始追踪关键词排名。{" "}
        <Link
          to={SUBSCRIBE_ROUTE}
          search={{ upgrade: true }}
          className="link font-medium"
        >
          升级到付费方案
        </Link>
        。
      </span>
    </div>
  );
}
