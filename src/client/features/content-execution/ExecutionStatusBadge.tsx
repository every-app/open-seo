import type { ContentExecutionStatus } from "@/types/content-execution";
import {
  getContentExecutionStatusClass,
  getContentExecutionStatusLabel,
} from "./content-execution-ui";

export function ExecutionStatusBadge({
  status,
}: {
  status: ContentExecutionStatus;
}) {
  return (
    <span
      className={`badge badge-sm whitespace-nowrap ${getContentExecutionStatusClass(status)}`}
    >
      {getContentExecutionStatusLabel(status)}
    </span>
  );
}
