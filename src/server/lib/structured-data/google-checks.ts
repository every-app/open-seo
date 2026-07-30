/**
 * Google rich-result checks against the rules table.
 *
 * Requirements are checked on every entity; recommendations only on the ones a
 * page is actually about. Verdicts are advisory — Search Console's own
 * `richResultsResult` is authoritative for a page Google has crawled.
 */
import {
  asArray,
  hasValue,
  isObject,
  pointer,
  type FindingCollector,
  type JsonObject,
} from "./findings";
import {
  RETIRED_FEATURES,
  RICH_RESULT_RULES,
  type RichResultRule,
} from "./google-rules";
import { ancestorChain, isTypeOrSubtypeOf } from "./vocabulary";

/** Resolves a dotted path, stepping through arrays. */
function hasPath(node: unknown, path: string): boolean {
  const [head, ...rest] = path.split(".");
  for (const candidate of asArray(node)) {
    if (!isObject(candidate)) continue;
    const value = candidate[head];
    if (!hasValue(value)) continue;
    if (rest.length === 0) return true;
    if (hasPath(value, rest.join("."))) return true;
  }
  return false;
}

/** A dotted requirement whose parent is absent is the parent's problem, not a
 *  second finding of its own. */
function parentPresent(node: JsonObject, path: string): boolean {
  const lastDot = path.lastIndexOf(".");
  if (lastDot === -1) return true;
  return hasPath(node, path.slice(0, lastDot));
}

/** Nearest rule wins, so `Restaurant` gets Local business rather than
 *  Organization, and `NewsArticle` gets Article. */
function findRule(types: string[]): RichResultRule | null {
  for (const type of types) {
    for (const ancestor of ancestorChain(type)) {
      const rule = RICH_RESULT_RULES.find((entry) => entry.type === ancestor);
      if (rule) return rule;
    }
  }
  return null;
}

/** `item` is required on every crumb except the last one, which is the current
 *  page — the one rule a property list cannot express. */
function checkBreadcrumbItems(
  node: JsonObject,
  path: string,
  rule: RichResultRule,
  collector: FindingCollector,
): void {
  const elements = Array.isArray(node.itemListElement)
    ? node.itemListElement
    : [];
  elements.forEach((element, index) => {
    if (!isObject(element)) return;
    const itemPath = pointer(pointer(path, "itemListElement"), index);
    const isLast = index === elements.length - 1;
    const required = isLast
      ? ["position", "name"]
      : ["position", "name", "item"];
    for (const property of required) {
      if (hasValue(element[property])) continue;
      collector.push(
        "missing-required-property",
        `Breadcrumb item ${index + 1} is missing "${property}".`,
        itemPath,
        {
          property,
          feature: rule.feature,
          type: "ListItem",
          docsUrl: rule.docsUrl,
        },
      );
    }
  });
}

function reportRetiredFeatures(
  knownTypes: string[],
  path: string,
  collector: FindingCollector,
): void {
  for (const retired of RETIRED_FEATURES) {
    if (!knownTypes.some((type) => isTypeOrSubtypeOf(type, retired.type))) {
      continue;
    }
    collector.push("retired-feature", retired.note, path, {
      feature: retired.feature,
      type: retired.type,
    });
  }
}

export function applyGoogleRules(
  node: JsonObject,
  knownTypes: string[],
  path: string,
  collector: FindingCollector,
  primary: boolean,
): void {
  reportRetiredFeatures(knownTypes, path, collector);

  const rule = findRule(knownTypes);
  if (!rule) return;

  const context = {
    feature: rule.feature,
    type: rule.type,
    docsUrl: rule.docsUrl,
  };

  const missingRequired = rule.required.filter(
    (property) => !hasPath(node, property) && parentPresent(node, property),
  );
  for (const property of missingRequired) {
    collector.push(
      "missing-required-property",
      `${rule.feature} requires "${property}".`,
      path,
      { ...context, property },
    );
  }

  const unmetGroups = (rule.requiredOneOf ?? []).filter(
    (group) => !group.some((property) => hasPath(node, property)),
  );
  for (const group of unmetGroups) {
    collector.push(
      "missing-one-of-required",
      `${rule.feature} requires at least one of: ${group.join(", ")}.`,
      path,
      context,
    );
  }

  const unmetConditionals = (rule.requiredWhenPresent ?? []).filter(
    (entry) =>
      hasPath(node, entry.path) &&
      !entry.oneOf.some((relative) => hasPath(node[entry.path], relative)),
  );
  for (const entry of unmetConditionals) {
    collector.push(
      "missing-required-property",
      `${rule.feature}: "${entry.path}" is present but carries none of ${entry.oneOf.join(", ")}.`,
      path,
      { ...context, property: entry.path },
    );
  }

  if (rule.type === "BreadcrumbList") {
    checkBreadcrumbItems(node, path, rule, collector);
  }

  // Recommendations describe what a page should say about its subject, so they
  // are only meaningful for the entity the page is about. Applied to every
  // nested reference they bury the findings that matter.
  if (!primary) return;

  const missingRecommended = rule.recommended.filter(
    (property) => !hasPath(node, property) && parentPresent(node, property),
  );
  if (missingRecommended.length > 0) {
    collector.push(
      "missing-recommended-properties",
      `${rule.feature} is missing recommended properties: ${missingRecommended.join(", ")}. These are optional, but Google uses them when it has them.`,
      path,
      context,
    );
  }

  collector.features.push({
    feature: rule.feature,
    type: knownTypes[0],
    eligible:
      missingRequired.length === 0 &&
      unmetGroups.length === 0 &&
      unmetConditionals.length === 0,
    missingRequired,
    missingRecommended,
    docsUrl: rule.docsUrl,
    checkedOn: rule.checkedOn,
  });
}
