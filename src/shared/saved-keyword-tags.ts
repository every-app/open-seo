const TAG_SEPARATOR = /[\n,]+/;

type NormalizedSavedKeywordTag = {
  name: string;
  normalizedName: string;
};

export function normalizeSavedKeywordTag(
  value: string,
): NormalizedSavedKeywordTag | null {
  const name = value.trim().replace(/\s+/g, " ");
  if (name.length === 0) return null;
  return {
    name,
    normalizedName: name.toLocaleLowerCase(),
  };
}

export function normalizeSavedKeywordTags(
  values: readonly string[] | undefined,
): NormalizedSavedKeywordTag[] {
  const tags = new Map<string, NormalizedSavedKeywordTag>();
  for (const value of values ?? []) {
    const tag = normalizeSavedKeywordTag(value);
    if (!tag || tags.has(tag.normalizedName)) continue;
    tags.set(tag.normalizedName, tag);
  }
  return [...tags.values()];
}

export function parseSavedKeywordTagInput(value: string): string[] {
  return normalizeSavedKeywordTags(value.split(TAG_SEPARATOR)).map(
    (tag) => tag.name,
  );
}
