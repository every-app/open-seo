// Print the hottest frames of a Cloudflare Workers profile (CPU or heap pprof)
// without Go's pprof tooling.
//
//   node pprof-top.mjs <profile.pprof> [--limit 30]
//
// Reads the raw protobuf: string table, functions, locations, and samples.
// The first location of a sample is the leaf frame, which is what "self"
// counts; "inclusive" counts every frame on the stack once.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { gunzipSync } from "node:zlib";

function varint(buf, i) {
  let result = 0n;
  let shift = 0n;
  for (;;) {
    if (i >= buf.length)
      throw new Error(
        "truncated profile: varint runs past the end of the file",
      );
    const byte = buf[i++];
    result |= BigInt(byte & 0x7f) << shift;
    shift += 7n;
    if (byte < 0x80) return [Number(result), i];
  }
}

function fields(buf) {
  const out = [];
  let i = 0;
  while (i < buf.length) {
    let key;
    [key, i] = varint(buf, i);
    const field = key >> 3;
    const wire = key & 7;
    let value;
    if (wire === 0) {
      [value, i] = varint(buf, i);
    } else if (wire === 2) {
      let length;
      [length, i] = varint(buf, i);
      if (i + length > buf.length)
        throw new Error(
          "truncated profile: a field runs past the end of the file",
        );
      value = buf.subarray(i, i + length);
      i += length;
    } else {
      throw new Error(`unsupported wire type ${wire}`);
    }
    out.push([field, value]);
  }
  return out;
}

function packed(value) {
  if (typeof value === "number") return [value];
  const out = [];
  let i = 0;
  while (i < value.length) {
    let x;
    [x, i] = varint(value, i);
    out.push(x);
  }
  return out;
}

const {
  values: { limit: limitArg },
  positionals: [file],
} = parseArgs({
  allowPositionals: true,
  options: { limit: { type: "string", default: "30" } },
});
const limit = Number(limitArg);
if (!file || !Number.isInteger(limit) || limit < 1) {
  console.error("usage: node pprof-top.mjs <profile.pprof> [--limit 30]");
  process.exit(1);
}

// The cf CLI writes the decoded protobuf; the raw API response is gzipped.
let data = readFileSync(file);
try {
  data = gunzipSync(data);
} catch {
  // Already uncompressed.
}

const profile = fields(data);
const strings = profile
  .filter(([field]) => field === 6)
  .map(([, value]) => value.toString("utf8"));
const sampleTypes = profile
  .filter(([field]) => field === 1)
  .map(([, value]) => {
    const type = new Map(fields(value));
    return `${strings[type.get(1)]}/${strings[type.get(2)]}`;
  });
const functions = new Map();
const locations = new Map();
const samples = [];
for (const [field, value] of profile) {
  if (field === 5) {
    const fn = new Map(fields(value));
    functions.set(fn.get(1), {
      name: strings[fn.get(2) ?? 0],
      file: strings[fn.get(4) ?? 0],
    });
  } else if (field === 4) {
    const location = fields(value);
    const id = location.find(([key]) => key === 1)[1];
    locations.set(
      id,
      location
        .filter(([key]) => key === 4)
        .map(([, line]) => new Map(fields(line)).get(1)),
    );
  } else if (field === 2) {
    const sample = fields(value);
    samples.push({
      locationIds: sample
        .filter(([key]) => key === 1)
        .flatMap(([, x]) => packed(x)),
      values: sample.filter(([key]) => key === 2).flatMap(([, x]) => packed(x)),
    });
  }
}

// The last value column is the weight (cpu/nanoseconds or space/bytes); the
// first is the raw sample count.
const column = Math.max(0, sampleTypes.length - 1);
const self = new Map();
const inclusive = new Map();
let total = 0;
for (const { locationIds, values } of samples) {
  const weight = values[column] ?? values[0] ?? 0;
  total += weight;
  const frames = locationIds.flatMap((id) =>
    (locations.get(id) ?? []).map((functionId) => {
      const fn = functions.get(functionId);
      if (!fn) return "?";
      const file = fn.file.split("/").pop();
      return `${fn.name || "(anonymous)"}  [${file}]`;
    }),
  );
  if (frames[0]) self.set(frames[0], (self.get(frames[0]) ?? 0) + weight);
  for (const frame of new Set(frames)) {
    inclusive.set(frame, (inclusive.get(frame) ?? 0) + weight);
  }
}

function print(title, map) {
  console.log(`\n== ${title} (${sampleTypes[column] ?? "weight"})`);
  const rows = [...map].sort((a, b) => b[1] - a[1]).slice(0, limit);
  for (const [frame, weight] of rows) {
    const percent = total ? ((100 * weight) / total).toFixed(1) : "0.0";
    console.log(`${percent.padStart(5)}%  ${frame}`);
  }
}

console.log(`${samples.length} samples`);
print("self", self);
print("inclusive", inclusive);
