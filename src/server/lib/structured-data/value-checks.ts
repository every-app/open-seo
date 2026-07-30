/**
 * Value checks against a property's `rangeIncludes`.
 *
 * Only unambiguous ranges are enforced: a format check runs when *every*
 * declared datatype agrees on the format, so `price` (Number **or** Text) is
 * left alone while `datePublished` (Date, DateTime) is not. Schema.org is
 * deliberately permissive here, so a stricter reading would flag correct markup.
 */
import {
  hasValue,
  isObject,
  pointer,
  readTypes,
  type FindingCollector,
} from "./findings";
import {
  bareTerm,
  enumMembers,
  isDataType,
  isTypeOrSubtypeOf,
  propertyRanges,
} from "./vocabulary";

/** How many enumeration members to name in a message before trailing off. */
const ENUM_HINT_COUNT = 6;

const DATE_PATTERN =
  /^\d{4}(-\d{2}(-\d{2})?)?([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const TIME_PATTERN = /^\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const NUMBER_PATTERN = /^[+-]?\d+(\.\d+)?$/;
const DURATION_PATTERN =
  /^-?P(?=\d|T\d)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/;

function isDateLike(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (TIME_PATTERN.test(trimmed)) return true;
  if (!DATE_PATTERN.test(trimmed)) return false;
  return Number.isFinite(Date.parse(trimmed));
}

function isAbsoluteHttpUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isNumberLike(value: unknown): boolean {
  if (typeof value === "number") return true;
  return typeof value === "string" && NUMBER_PATTERN.test(value.trim());
}

function isDurationLike(value: unknown): boolean {
  return typeof value === "string" && DURATION_PATTERN.test(value.trim());
}

function isBooleanLike(value: unknown): boolean {
  if (typeof value === "boolean") return true;
  if (typeof value !== "string") return false;
  return ["true", "false"].includes(bareTerm(value).toLowerCase());
}

/** Literal values only reach here as string | number | boolean. */
function display(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value) ?? "";
}

/** A property's range, split into nested-entity types and literal datatypes. */
type SplitRanges = { classes: string[]; datatypes: string[] };

/** Each entry: the datatypes it applies to, the predicate, and the message. */
const LITERAL_FORMATS: ReadonlyArray<{
  ranges: readonly string[];
  valid: (value: unknown) => boolean;
  expected: string;
}> = [
  {
    ranges: ["Date", "DateTime", "Time"],
    valid: isDateLike,
    expected: "an ISO 8601 date (e.g. 2026-07-30 or 2026-07-30T09:00:00+10:00)",
  },
  {
    ranges: ["URL"],
    valid: isAbsoluteHttpUrl,
    expected: "an absolute http(s) URL",
  },
  {
    ranges: ["Number", "Integer", "Float"],
    valid: isNumberLike,
    expected: "a number",
  },
  {
    ranges: ["Duration"],
    valid: isDurationLike,
    expected: "an ISO 8601 duration (e.g. PT30M)",
  },
  { ranges: ["Boolean"], valid: isBooleanLike, expected: "true or false" },
  {
    // The Quantity family is unit-bearing by design — Schema.org's own examples
    // are "334 kcal" and "5 g" — so only a value with no number is wrong.
    ranges: ["Quantity", "Distance", "Mass", "Energy"],
    valid: (value) => typeof value === "number" || /\d/.test(display(value)),
    expected: 'a quantity (e.g. "334 kcal")',
  },
];

function checkObjectValue(
  property: string,
  value: Record<string, unknown>,
  path: string,
  ranges: SplitRanges,
  collector: FindingCollector,
): void {
  const valueTypes = readTypes(value);
  if (valueTypes.length > 0 && ranges.classes.length > 0) {
    const fits = valueTypes.some((type) =>
      ranges.classes.some((range) => isTypeOrSubtypeOf(type, range)),
    );
    if (!fits) {
      collector.push(
        "range-mismatch",
        `"${property}" expects ${ranges.classes.join(" or ")}; got ${valueTypes.join(" and ")}.`,
        path,
        { property },
      );
    }
    return;
  }
  // A bare `{"@id": "…"}` is a reference to an entity defined elsewhere.
  if (ranges.classes.length === 0 && !hasValue(value["@id"])) {
    collector.push(
      "range-mismatch",
      `"${property}" expects a literal value (${ranges.datatypes.join(" or ")}); got an object.`,
      path,
      { property },
    );
  }
}

/**
 * Enumeration members are accepted in bare or URL form, and accepted even when
 * the range mixes an enumeration with an ordinary class (`suitableForDiet` is
 * `Diet` **or** the `RestrictedDiet` enumeration). Only a range made purely of
 * enumerations can call a non-member an error.
 *
 * Returns true when the value has been dealt with.
 */
function checkEnumValue(
  property: string,
  value: string,
  path: string,
  ranges: SplitRanges,
  collector: FindingCollector,
): boolean {
  const enumRanges = ranges.classes.filter(
    (range) => enumMembers(range) !== null,
  );
  if (enumRanges.length === 0) return false;

  const members = enumRanges.flatMap((range) => enumMembers(range) ?? []);
  const candidate = bareTerm(value);
  if (members.includes(candidate)) return true;
  if (
    enumRanges.length !== ranges.classes.length ||
    ranges.datatypes.length > 0
  ) {
    return false;
  }

  const hint = members.slice(0, ENUM_HINT_COUNT).join(", ");
  const more = members.length > ENUM_HINT_COUNT ? ", …" : "";
  collector.push(
    "invalid-enum-value",
    `"${candidate}" is not a member of ${ranges.classes.join(" or ")}. Valid values include: ${hint}${more}.`,
    path,
    { property },
  );
  return true;
}

export function checkPropertyValue(
  property: string,
  value: unknown,
  path: string,
  collector: FindingCollector,
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      checkPropertyValue(property, entry, pointer(path, index), collector),
    );
    return;
  }

  const declared = propertyRanges(property);
  if (declared.length === 0) return;
  const ranges: SplitRanges = {
    classes: declared.filter((range) => !isDataType(range)),
    datatypes: declared.filter(isDataType),
  };

  if (isObject(value)) {
    checkObjectValue(property, value, path, ranges, collector);
    return;
  }
  if (value === null || value === undefined) return;

  if (typeof value === "string" && value.trim() === "") {
    collector.push(
      "empty-value",
      `"${property}" is empty. Drop the property rather than emitting a blank value.`,
      path,
      { property },
    );
    return;
  }

  if (
    typeof value === "string" &&
    checkEnumValue(property, value, path, ranges, collector)
  ) {
    return;
  }

  if (ranges.datatypes.length === 0 && ranges.classes.length > 0) {
    collector.push(
      "range-mismatch",
      `"${property}" expects a nested ${ranges.classes.join(" or ")} object; got a bare value.`,
      path,
      { property },
    );
    return;
  }

  const format = LITERAL_FORMATS.find(
    (entry) =>
      ranges.datatypes.length > 0 &&
      ranges.datatypes.every((range) => entry.ranges.includes(range)),
  );
  if (format && !format.valid(value)) {
    collector.push(
      "invalid-literal",
      `"${property}" must be ${format.expected}; got "${display(value)}".`,
      path,
      { property },
    );
  }
}
