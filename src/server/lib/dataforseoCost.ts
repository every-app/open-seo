export type DataforseoApiCallCost = {
  path: string[];
  costUsd: number;
  resultCount: number | null;
};

export type DataforseoApiResponse<T> = {
  data: T;
  billing: DataforseoApiCallCost;
};
