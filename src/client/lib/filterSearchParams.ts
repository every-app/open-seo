/**
 * Filter panels hold text. The URL holds numeric fields as numbers, so it
 * reads `?minVol=100` and not `?minVol="100"`. `include` and `exclude` stay
 * text.
 */
function isTextField(key: string) {
  return key === "include" || key === "exclude";
}

export function filterValuesFromSearch<TValues extends Record<string, string>>(
  search: Partial<Record<keyof TValues, string | number>>,
  empty: TValues,
): TValues {
  const values = { ...empty };
  for (const key in empty) {
    const value = search[key];
    if (value !== undefined) Object.assign(values, { [key]: String(value) });
  }
  return values;
}

export function filterValuesToSearch<TSearch>(
  values: Record<string, string>,
): Partial<TSearch> {
  const update: Partial<TSearch> = {};
  for (const [key, raw] of Object.entries(values)) {
    const value = raw.trim();
    const parsed = Number(value);
    Object.assign(update, {
      [key]:
        value === ""
          ? undefined
          : isTextField(key)
            ? value
            : Number.isFinite(parsed)
              ? parsed
              : undefined,
    });
  }
  return update;
}

/** Filter values as they come back from the URL ("10." becomes "10"). */
export function normalizeFilterValues<TValues extends Record<string, string>>(
  values: TValues,
  empty: TValues,
): TValues {
  return filterValuesFromSearch(filterValuesToSearch(values), empty);
}
