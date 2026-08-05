/**
 * Structured-data validation: parse → vocabulary → Google rules (spec 0012).
 *
 * Pure and network-free. The verdict is advisory — for a live page, Search
 * Console's `richResultsResult` is authoritative, because that is Google's own
 * parser on Google's own crawl. This exists for the case Search Console cannot
 * serve at all: markup that is not published yet.
 *
 * This module owns the parse pass and the walk; the value checks and the Google
 * rules live next door in value-checks.ts and google-checks.ts.
 *
 * Where Schema.org's own semantics are advisory (`domainIncludes` and
 * `rangeIncludes` describe expected usage, they do not constrain it), a miss is
 * a warning. Errors are reserved for markup that is broken outright: a type or
 * property that does not exist, a literal in the wrong format, an enumeration
 * value that is not a member, a missing required property.
 */
import {
  collectJsonLdScripts,
  collectJsonLdScriptsFromHtml,
  unwrapScriptText,
  type JsonLdScript,
} from "./extract";
import {
  asArray,
  FindingCollector,
  isObject,
  pointer,
  readTypes,
  type JsonObject,
} from "./findings";
import { applyGoogleRules } from "./google-checks";
import { checkPropertyValue } from "./value-checks";
import {
  bareTerm,
  isKnownProperty,
  isKnownType,
  SCHEMA_VERSION,
  propertyAppliesTo,
  supersededBy,
} from "./vocabulary";
import type { ValidationResult } from "./types";
import type * as cheerio from "cheerio";

/** Far beyond any real markup; guards against pathological nesting. */
const MAX_DEPTH = 20;

/**
 * Keys Google's own documented patterns use that are not Schema.org
 * properties. `query-input` comes from the sitelinks searchbox example, which
 * is the canonical `SearchAction` markup — reporting it as a typo would flag
 * correct markup on a large share of homepages.
 */
const NON_VOCABULARY_KEYS = new Set(["query-input"]);

/**
 * Properties that carry a page's primary entity. Google's *recommended*
 * property lists describe what the page is about, so they are evaluated on
 * top-level entities and on whatever these point at — not on every nested
 * `publisher` or `subOrganization`, which would bury the real findings.
 * Requirements, by contrast, apply at every depth: a nested entity missing a
 * required property is broken wherever it sits.
 */
const PRIMARY_ENTITY_PROPERTIES = new Set(["mainEntity", "mainEntityOfPage"]);

/**
 * A reference (`{"@id": "#jane"}`) or a value object — keywords only, and no
 * `@type`. It is not an entity missing its type, and it carries nothing to
 * check. A node that declares `@type` is an entity even when it has no
 * properties yet, which is exactly the case worth reporting on.
 */
function isReferenceNode(node: JsonObject): boolean {
  if (node["@type"] !== undefined) return false;
  return Object.keys(node).every((key) => key.startsWith("@"));
}

function isSchemaOrgContext(value: string): boolean {
  return /^https?:\/\/schema\.org\/?$/.test(value.trim());
}

/** Every string reachable from one node's `@context`, including the object form
 *  (`{"@vocab": "https://schema.org/"}`). */
function contextStrings(context: unknown): string[] {
  const found: string[] = [];
  for (const candidate of asArray(context)) {
    if (typeof candidate === "string") {
      found.push(candidate);
      continue;
    }
    if (!isObject(candidate)) continue;
    for (const nested of Object.values(candidate)) {
      if (typeof nested === "string") found.push(nested);
    }
  }
  return found;
}

/** `@context` may sit on the wrapper or on each top-level node. */
function collectContextValues(value: unknown): string[] {
  return asArray(value)
    .filter(isObject)
    .flatMap((entry) =>
      entry["@context"] === undefined ? [] : contextStrings(entry["@context"]),
    );
}

type Entity = { value: JsonObject; path: string };

// ---------------------------------------------------------------------------
// parse layer
// ---------------------------------------------------------------------------

function parseScript(
  script: JsonLdScript,
  collector: FindingCollector,
): Entity[] {
  const text = unwrapScriptText(script.text);
  if (text === "") {
    collector.push(
      "empty-script",
      "Empty application/ld+json script. Remove it or fill it in — an empty block is dead weight that some consumers log as an error.",
      "",
    );
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unparseable";
    collector.push(
      "invalid-json",
      `Not valid JSON, so nothing in this block is read by anything: ${detail}`,
      "",
    );
    return [];
  }

  const contexts = collectContextValues(parsed);
  if (contexts.length === 0) {
    collector.push(
      "missing-context",
      'No @context. Add "@context": "https://schema.org" so consumers can resolve the terms.',
      "",
    );
  } else if (!contexts.some(isSchemaOrgContext)) {
    collector.push(
      "foreign-context",
      `@context is ${contexts[0]}, not schema.org. Skipped — this validator only judges Schema.org vocabulary.`,
      "",
    );
    return [];
  }

  return unwrapEntities(parsed, "", collector);
}

/** Flattens the three shapes real markup uses: a bare node, an array of nodes,
 *  and a `@graph` wrapper. */
function unwrapEntities(
  value: unknown,
  path: string,
  collector: FindingCollector,
): Entity[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      unwrapEntities(entry, pointer(path, index), collector),
    );
  }
  if (!isObject(value)) {
    collector.push(
      "not-an-object",
      `Expected a JSON object describing an entity, found ${typeof value}.`,
      path,
    );
    return [];
  }
  const graph = value["@graph"];
  if (Array.isArray(graph)) {
    return graph.flatMap((entry, index) =>
      unwrapEntities(entry, pointer(pointer(path, "@graph"), index), collector),
    );
  }
  return [{ value, path }];
}

// ---------------------------------------------------------------------------
// vocabulary layer
// ---------------------------------------------------------------------------

function checkTypes(
  types: string[],
  path: string,
  collector: FindingCollector,
): void {
  for (const type of types) {
    if (!isKnownType(type)) {
      collector.push(
        "unknown-type",
        `"${type}" is not a Schema.org type (vocabulary ${SCHEMA_VERSION}). Check the spelling and capitalisation.`,
        path,
        { type },
      );
      continue;
    }
    const replacement = supersededBy(type);
    if (replacement) {
      collector.push(
        "superseded-term",
        `Type "${type}" is superseded by "${replacement}".`,
        path,
        { type },
      );
    }
  }
}

function checkProperty(
  property: string,
  knownTypes: string[],
  path: string,
  collector: FindingCollector,
): void {
  if (!isKnownProperty(property)) {
    collector.push(
      "unknown-property",
      `"${property}" is not a Schema.org property (vocabulary ${SCHEMA_VERSION}). Check the spelling and capitalisation.`,
      path,
      { property },
    );
    return;
  }
  const replacement = supersededBy(property);
  if (replacement) {
    collector.push(
      "superseded-term",
      `Property "${property}" is superseded by "${replacement}".`,
      path,
      { property },
    );
  }
  if (knownTypes.length > 0 && !propertyAppliesTo(property, knownTypes)) {
    collector.push(
      "property-not-on-type",
      `"${property}" is not declared on ${knownTypes.join(" or ")}. It may be ignored — check you meant this property on this type.`,
      path,
      { property, type: knownTypes[0] },
    );
  }
}

function walkNode(
  node: JsonObject,
  path: string,
  collector: FindingCollector,
  depth = 0,
  primary = true,
): void {
  if (depth > MAX_DEPTH) return;
  collector.nodeCount += 1;

  const referenceNode = isReferenceNode(node);
  const types = readTypes(node);
  for (const type of types) collector.seeType(type, primary);

  if (!referenceNode && types.length === 0) {
    collector.push(
      "missing-type",
      "Entity has no @type, so consumers cannot tell what it describes.",
      path,
    );
  }
  checkTypes(types, path, collector);

  const knownTypes = types.filter(isKnownType);

  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@") || NON_VOCABULARY_KEYS.has(key)) continue;
    const property = bareTerm(key);
    const propertyPath = pointer(path, key);

    checkProperty(property, knownTypes, propertyPath, collector);
    if (isKnownProperty(property)) {
      checkPropertyValue(property, value, propertyPath, collector);
    }

    recurseValue(
      value,
      propertyPath,
      collector,
      depth,
      primary && PRIMARY_ENTITY_PROPERTIES.has(property),
    );
  }

  if (!referenceNode && knownTypes.length > 0) {
    applyGoogleRules(node, knownTypes, path, collector, primary);
  }
}

function recurseValue(
  value: unknown,
  path: string,
  collector: FindingCollector,
  depth: number,
  primary: boolean,
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      recurseValue(entry, pointer(path, index), collector, depth, primary),
    );
    return;
  }
  if (isObject(value)) walkNode(value, path, collector, depth + 1, primary);
}

// ---------------------------------------------------------------------------
// entry points
// ---------------------------------------------------------------------------

function toResult(
  collector: FindingCollector,
  scriptCount: number,
): ValidationResult {
  const ruled = new Set(
    collector.features.flatMap((feature) => [feature.feature, feature.type]),
  );
  return {
    schemaVersion: SCHEMA_VERSION,
    scriptCount,
    nodeCount: collector.nodeCount,
    types: collector.types,
    features: collector.features,
    // Computed here so every surface reports the same set. Primary types only:
    // a nested ListItem under a validated BreadcrumbList never had a verdict to
    // miss, and listing it dilutes the types that genuinely went unchecked.
    notCheckedTypes: collector.primaryTypes.filter((type) => !ruled.has(type)),
    findings: collector.findings,
    errorCount: collector.findings.filter((f) => f.severity === "error").length,
    warningCount: collector.findings.filter((f) => f.severity === "warning")
      .length,
  };
}

function validateJsonLdScripts(scripts: JsonLdScript[]): ValidationResult {
  const collector = new FindingCollector();
  for (const script of scripts) {
    collector.forScript(script.index);
    for (const entity of parseScript(script, collector)) {
      walkNode(entity.value, entity.path, collector);
    }
  }
  return toResult(collector, scripts.length);
}

/** For the site-audit crawler, which already holds a loaded document. */
export function validateCheerioDocument(
  $: cheerio.CheerioAPI,
): ValidationResult {
  return validateJsonLdScripts(collectJsonLdScripts($));
}

/** Async because parsing a raw HTML string needs cheerio, which is loaded on
 *  demand to stay off the worker's eager startup graph. */
export async function validateHtml(html: string): Promise<ValidationResult> {
  return validateJsonLdScripts(await collectJsonLdScriptsFromHtml(html));
}

/** A bare JSON-LD snippet, as pasted from an editor. Needs no HTML parser. */
export function validateJsonLdText(text: string): ValidationResult {
  return validateJsonLdScripts([{ index: 0, text }]);
}

/** Accepts either form: a JSON-LD snippet or a whole HTML document. */
export async function validateMarkup(
  markup: string,
): Promise<ValidationResult> {
  const trimmed = markup.trim();
  const looksLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[");
  return looksLikeJson
    ? validateJsonLdText(trimmed)
    : await validateHtml(markup);
}
