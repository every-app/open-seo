import { AsyncLocalStorage } from "node:async_hooks";

export type DataforseoRequestContext = {
  organizationId?: string | null;
  projectId?: string | null;
  login?: string;
  password?: string;
};

const dataforseoContextStorage =
  new AsyncLocalStorage<DataforseoRequestContext>();

export function runWithDataforseoContext<T>(
  ctx: DataforseoRequestContext,
  fn: () => T,
): T {
  return dataforseoContextStorage.run(ctx, fn);
}

export function getDataforseoContext(): DataforseoRequestContext | undefined {
  return dataforseoContextStorage.getStore();
}
