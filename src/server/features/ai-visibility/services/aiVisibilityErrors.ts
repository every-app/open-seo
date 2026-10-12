import { AppError } from "@/server/lib/errors";

export class AiVisibilityError extends AppError {
  constructor(
    public readonly reason: string,
    message: string,
    public readonly runId?: string,
  ) {
    super("AI_VISIBILITY_ERROR", message);
  }
}
