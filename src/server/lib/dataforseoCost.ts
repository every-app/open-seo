import { AppError } from "@/server/lib/errors";

export type DataforseoApiCallCost = {
  path: string[];
  costUsd: number;
  resultCount: number | null;
};

export type DataforseoApiResponse<T> = {
  data: T;
  billing: DataforseoApiCallCost;
};

export class DataforseoChargedTaskError extends AppError {
  constructor(
    message: string,
    public readonly billing: DataforseoApiCallCost,
  ) {
    super("INTERNAL_ERROR", message);
    this.name = "DataforseoChargedTaskError";
  }
}
