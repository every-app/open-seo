import { sortBy } from "remeda";

// Minimal in-memory KVNamespace honoring expiration/expirationTtl against
// Date.now(), so vi.setSystemTime drives token/grant expiry.
export function createKvFake() {
  const store = new Map<
    string,
    { value: string; metadata?: unknown; expiresAt?: number }
  >();
  const live = (key: string) => {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && Date.now() >= entry.expiresAt) {
      store.delete(key);
      return undefined;
    }
    return entry;
  };
  return {
    get(key: string, type?: unknown) {
      const entry = live(key);
      if (!entry) return Promise.resolve(null);
      const wantsJson =
        type === "json" ||
        (typeof type === "object" &&
          type !== null &&
          (type as { type?: string }).type === "json");
      return Promise.resolve(wantsJson ? JSON.parse(entry.value) : entry.value);
    },
    put(
      key: string,
      value: string,
      options?: {
        expiration?: number;
        expirationTtl?: number;
        metadata?: unknown;
      },
    ) {
      store.set(key, {
        value,
        metadata: options?.metadata,
        expiresAt:
          options?.expiration !== undefined
            ? options.expiration * 1000
            : options?.expirationTtl !== undefined
              ? Date.now() + options.expirationTtl * 1000
              : undefined,
      });
      return Promise.resolve();
    },
    delete(key: string) {
      store.delete(key);
      return Promise.resolve();
    },
    list(options?: { prefix?: string; cursor?: string; limit?: number }) {
      const remaining = sortBy(
        [...store.keys()]
          .filter((key) => live(key))
          .filter((key) => !options?.prefix || key.startsWith(options.prefix))
          .filter((key) => !options?.cursor || key > options.cursor),
        (key) => key,
      );
      const keys = remaining.slice(0, options?.limit ?? 1000).map((name) => {
        const entry = store.get(name);
        return {
          name,
          metadata: entry?.metadata,
          expiration: entry?.expiresAt
            ? Math.floor(entry.expiresAt / 1000)
            : undefined,
        };
      });
      return Promise.resolve({
        keys,
        list_complete: keys.length === remaining.length,
        cursor: keys.at(-1)?.name ?? "",
      });
    },
  };
}
