/**
 * JSON-LD graph summarization for the audit engine.
 *
 * Search engines and AI assistants read a page's structured data as one graph
 * of entities. When a page ships several `<script type="application/ld+json">`
 * blocks that never reference each other, consumers see a pile of unrelated
 * nodes instead of "this Article, by this Person, published by this
 * Organization" — the relationships that make the data worth emitting are
 * simply absent.
 *
 * Blocks are folded in one at a time and only a handful of counters survive,
 * because page-analyzer.ts runs ~25 parses concurrently on a 128MB isolate and
 * buffering raw JSON-LD would reintroduce the OOM class that file exists to
 * avoid. Everything here is pure, so the check is unit-testable without a DOM
 * or a network.
 */

/** Blocks past this are counted but not parsed — pages this deep are pathological. */
const MAX_PARSED_BLOCKS = 25;
/** Longer blocks are counted as present but not parsed (see memory note above). */
const MAX_BLOCK_CHARS = 64_000;
/** Cap on tracked @id values, so a huge catalog can't grow the accumulator without bound. */
const MAX_TRACKED_IDS = 200;
/** Guards against deeply nested or cyclic structures while walking a block. */
const MAX_WALK_DEPTH = 12;

export interface JsonLdAccumulator {
  /** Every ld+json block seen, including ones too large or malformed to parse. */
  blocks: number;
  /** Blocks that failed JSON.parse (malformed structured data). */
  invalidBlocks: number;
  /** Blocks skipped by the size/count caps — treated as unknown, never as unlinked. */
  skippedBlocks: number;
  /** Top-level entity nodes across all blocks, expanding @graph and arrays. */
  nodes: number;
  /** True when any block uses the @graph container. */
  hasGraph: boolean;
  declaredIds: Set<string>;
  referencedIds: Set<string>;
}

export interface JsonLdSummary {
  blocks: number;
  invalidBlocks: number;
  nodes: number;
  hasGraph: boolean;
  /** True when a node references an @id that another node declares. */
  crossReferenced: boolean;
  /** True when a cap kept us from seeing the whole picture; suppresses the check. */
  truncated: boolean;
}

export function createJsonLdAccumulator(): JsonLdAccumulator {
  return {
    blocks: 0,
    invalidBlocks: 0,
    skippedBlocks: 0,
    nodes: 0,
    hasGraph: false,
    declaredIds: new Set(),
    referencedIds: new Set(),
  };
}

function track(set: Set<string>, value: string) {
  if (set.size < MAX_TRACKED_IDS) set.add(value);
}

/**
 * Walk one parsed node. `topLevel` nodes are the entities a consumer sees;
 * nested objects still contribute @id references (that's how a linked graph
 * expresses "this Article's author is that Person").
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walk(
  value: unknown,
  acc: JsonLdAccumulator,
  depth: number,
  topLevel: boolean,
) {
  if (depth > MAX_WALK_DEPTH) return;

  if (Array.isArray(value)) {
    for (const item of value) walk(item, acc, depth + 1, topLevel);
    return;
  }

  if (!isRecord(value)) return;
  const node = value;

  const graph = node["@graph"];
  if (graph !== undefined) {
    acc.hasGraph = true;
    walk(graph, acc, depth + 1, true);
    // A @graph wrapper is a container, not an entity of its own.
    if (!("@type" in node)) return;
  }

  const id = node["@id"];
  if (typeof id === "string" && id) {
    // A bare {"@id": "..."} with no other meaningful key is a reference to
    // another node; anything carrying a @type is declaring its own identity.
    if ("@type" in node) {
      track(acc.declaredIds, id);
    } else {
      track(acc.referencedIds, id);
    }
  }

  if (topLevel && "@type" in node) acc.nodes += 1;

  for (const [key, child] of Object.entries(node)) {
    if (key === "@graph" || key === "@id" || key === "@context") continue;
    walk(child, acc, depth + 1, false);
  }
}

export function addJsonLdBlock(acc: JsonLdAccumulator, text: string) {
  acc.blocks += 1;

  if (acc.blocks > MAX_PARSED_BLOCKS || text.length > MAX_BLOCK_CHARS) {
    acc.skippedBlocks += 1;
    return;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    acc.invalidBlocks += 1;
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    acc.invalidBlocks += 1;
    return;
  }

  walk(parsed, acc, 0, true);
}

export function summarizeJsonLd(acc: JsonLdAccumulator): JsonLdSummary {
  let crossReferenced = false;
  for (const ref of acc.referencedIds) {
    if (acc.declaredIds.has(ref)) {
      crossReferenced = true;
      break;
    }
  }

  return {
    blocks: acc.blocks,
    invalidBlocks: acc.invalidBlocks,
    nodes: acc.nodes,
    hasGraph: acc.hasGraph,
    crossReferenced,
    truncated:
      acc.skippedBlocks > 0 ||
      acc.declaredIds.size >= MAX_TRACKED_IDS ||
      acc.referencedIds.size >= MAX_TRACKED_IDS,
  };
}

export const EMPTY_JSON_LD_SUMMARY: JsonLdSummary = {
  blocks: 0,
  invalidBlocks: 0,
  nodes: 0,
  hasGraph: false,
  crossReferenced: false,
  truncated: false,
};

/**
 * A page fails the "linked graph" bar when it publishes several independent
 * entities with nothing tying them together. One entity needs no links, a
 * @graph container is linked by construction, and a resolvable @id reference
 * is the explicit way to connect nodes across separate blocks. Anything we
 * couldn't fully inspect is given the benefit of the doubt.
 */
export function isUnlinkedJsonLdGraph(summary: JsonLdSummary): boolean {
  if (summary.truncated) return false;
  if (summary.hasGraph || summary.crossReferenced) return false;
  return summary.nodes >= 2;
}
