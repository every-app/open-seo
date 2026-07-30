/**
 * Compile the Schema.org vocabulary into the lookup tables the structured-data
 * validator needs, and write them to
 * `src/server/lib/structured-data/vocabulary.generated.ts`.
 *
 * Why a committed artifact rather than a runtime fetch (spec 0012):
 *   - the Worker never depends on schema.org being up,
 *   - the build needs no network and the bundle stays deterministic,
 *   - a vocabulary bump is a reviewable commit, not a silent behaviour change.
 *
 * Usage:
 *   pnpm schema:vocab                 # regenerate at the pinned version
 *   pnpm schema:vocab --version=30.1  # bump (check the release notes first)
 *
 * The full release dump is ~1.5 MB; the compiled tables are a fraction of that
 * because only the relations the validator actually reads survive:
 * class hierarchy, property domains/ranges, enumeration members, datatypes,
 * and superseded terms.
 */

import process from "node:process";
import { writeFile } from "node:fs/promises";
import { format } from "prettier";

/** Bump deliberately: read https://schema.org/docs/releases.html first. */
const PINNED_VERSION = "30.0";

const OUT_PATH = "src/server/lib/structured-data/vocabulary.generated.ts";

/** The seven classes Schema.org itself tags as `schema:DataType`. Their
 *  subclasses (URL, Integer, Duration, …) are derived, not listed. */
const DATA_TYPE_ROOTS = [
  "Boolean",
  "Date",
  "DateTime",
  "Number",
  "Quantity",
  "Text",
  "Time",
];

type GraphNode = {
  "@id": string;
  "@type": string | string[];
  "rdfs:subClassOf"?: Ref | Ref[];
  "schema:domainIncludes"?: Ref | Ref[];
  "schema:rangeIncludes"?: Ref | Ref[];
  "schema:supersededBy"?: Ref | Ref[];
};
type Ref = { "@id": string };

function versionArg(): string {
  const flag = process.argv.find((a) => a.startsWith("--version="));
  return flag ? flag.slice("--version=".length) : PINNED_VERSION;
}

function list<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** `schema:Article` → `Article`; anything outside the schema: namespace (the
 *  dump also carries bibo:, dc:, and dcterms: terms) → null. */
function term(id: string | undefined): string | null {
  if (!id?.startsWith("schema:")) return null;
  return id.slice("schema:".length);
}

function refTerms(value: Ref | Ref[] | undefined): string[] {
  return list(value)
    .map((ref) => term(ref["@id"]))
    .filter((name): name is string => name !== null);
}

/** One line per term, values space-joined: keeps the generated file small and
 *  its diffs readable (a changed term is a one-line change). */
function joinedTable(entries: Map<string, string[]>): string {
  const keys = [...entries.keys()].sort();
  const lines = keys.map((key) => {
    const value = entries.get(key)?.join(" ") ?? "";
    return `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`;
  });
  return `{\n${lines.join("\n")}\n}`;
}

async function main() {
  const version = versionArg();
  const url = `https://schema.org/version/${version}/schemaorg-current-https.jsonld`;
  console.log(`Fetching ${url}`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Schema.org returned ${response.status} for version ${version}. ` +
        `Check the version exists at https://schema.org/docs/releases.html`,
    );
  }
  const dump = (await response.json()) as { "@graph": GraphNode[] };
  const graph = dump["@graph"];
  console.log(`  ${graph.length} terms in the release graph`);

  const typeParents = new Map<string, string[]>();
  const propertyDomains = new Map<string, string[]>();
  const propertyRanges = new Map<string, string[]>();
  const supersededBy = new Map<string, string[]>();
  const enumMembers = new Map<string, string[]>();
  const dataTypeTagged = new Set<string>();

  for (const node of graph) {
    const name = term(node["@id"]);
    if (!name) continue;
    const nodeTypes = list(node["@type"]);

    const superseded = refTerms(node["schema:supersededBy"]);
    if (superseded.length > 0) supersededBy.set(name, superseded);

    if (nodeTypes.includes("rdf:Property")) {
      propertyDomains.set(name, refTerms(node["schema:domainIncludes"]));
      propertyRanges.set(name, refTerms(node["schema:rangeIncludes"]));
      continue;
    }

    if (nodeTypes.includes("rdfs:Class")) {
      typeParents.set(name, refTerms(node["rdfs:subClassOf"]));
      if (nodeTypes.includes("schema:DataType")) dataTypeTagged.add(name);
      continue;
    }

    // Anything else is an enumeration member: its @type is the enumeration
    // it belongs to (`schema:InStock` is a `schema:ItemAvailability`).
    for (const enumType of nodeTypes) {
      const owner = term(enumType);
      if (!owner) continue;
      const members = enumMembers.get(owner) ?? [];
      members.push(name);
      enumMembers.set(owner, members);
    }
  }

  for (const root of DATA_TYPE_ROOTS) {
    if (!dataTypeTagged.has(root)) {
      throw new Error(
        `Expected ${root} to be tagged schema:DataType in ${version}. ` +
          `The vocabulary's shape changed — review this script.`,
      );
    }
  }

  // Datatypes are the tagged roots plus every class beneath them, so literal
  // checks reach URL (⊂ Text), Integer (⊂ Number), and Duration (⊂ Quantity).
  const dataTypes = new Set(dataTypeTagged);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [type, parents] of typeParents) {
      if (dataTypes.has(type)) continue;
      if (parents.some((parent) => dataTypes.has(parent))) {
        dataTypes.add(type);
        grew = true;
      }
    }
  }

  const header = `/* eslint-disable max-lines */
/**
 * GENERATED FILE — do not edit by hand.
 *
 * Schema.org vocabulary ${version}, compiled by scripts/generate-schema-vocabulary.ts.
 * Regenerate with \`pnpm schema:vocab\`.
 *
 * Values are space-joined term lists; src/server/lib/structured-data/
 * vocabulary.ts turns them into lookup maps once per isolate.
 */

export const SCHEMA_VERSION = ${JSON.stringify(version)};
`;

  const body = `
/** Class → its direct supertypes (\`rdfs:subClassOf\`). */
export const TYPE_PARENTS: Record<string, string> = ${joinedTable(typeParents)};

/** Property → the classes it is declared on (\`schema:domainIncludes\`). */
export const PROPERTY_DOMAINS: Record<string, string> = ${joinedTable(propertyDomains)};

/** Property → its declared value types (\`schema:rangeIncludes\`). */
export const PROPERTY_RANGES: Record<string, string> = ${joinedTable(propertyRanges)};

/** Retired term → the term that replaces it (\`schema:supersededBy\`). */
export const SUPERSEDED_BY: Record<string, string> = ${joinedTable(supersededBy)};

/** Enumeration class → its valid members (\`ItemAvailability\` → \`InStock\` …). */
export const ENUM_MEMBERS: Record<string, string> = ${joinedTable(enumMembers)};

/** Literal-valued classes: the \`schema:DataType\` roots and their subclasses. */
export const DATA_TYPES = ${JSON.stringify([...dataTypes].sort().join(" "))};
`;

  const source = await format(header + body, { parser: "typescript" });
  await writeFile(OUT_PATH, source, "utf8");

  console.log(`Wrote ${OUT_PATH}`);
  console.log(`  ${typeParents.size} classes`);
  console.log(`  ${propertyDomains.size} properties`);
  console.log(`  ${enumMembers.size} enumerations`);
  console.log(`  ${supersededBy.size} superseded terms`);
  console.log(`  ${dataTypes.size} datatypes`);
  console.log(`  ${(source.length / 1024).toFixed(0)} KB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
