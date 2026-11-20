// floorplan graph queries, shared by the viewer (as page tools for the Claude app) and by
// floorplan/query.mjs (as a CLI that the Claude Code CLI or Codex calls). Plain script: no imports, no exports.
// Item ids: n:<node id>  f:<file path>  r:<route index>  s:<file path>#<export index>

function createGraphQuery(G) {
  const nodes = new Map(G.nodes.map((n) => [n.id, n]));
  const files = new Map(G.files.map((f) => [f.p, f]));
  const routes = G.routes || [];
  const routesByFile = new Map();
  routes.forEach((r, i) => { if (!routesByFile.has(r.f)) routesByFile.set(r.f, []); routesByFile.get(r.f).push(i); });
  const kidsOf = new Map();
  for (const n of G.nodes) if (n.parent) { if (!kidsOf.has(n.parent)) kidsOf.set(n.parent, []); kidsOf.get(n.parent).push(n.id); }

  const nodeChain = (id) => { const out = []; let n = nodes.get(id); while (n) { out.push(n.id); n = n.parent ? nodes.get(n.parent) : null; } return out; };
  /** The node ids an item lives under, deepest first. */
  function owners(id) {
    if (id.startsWith('n:')) return nodeChain(id.slice(2));
    if (id.startsWith('f:')) { const f = files.get(id.slice(2)); return f ? nodeChain(f.n) : []; }
    if (id.startsWith('r:')) { const r = routes[+id.slice(2)]; return r ? owners('f:' + r.f) : []; }
    if (id.startsWith('s:')) return owners('f:' + id.slice(2).replace(/#\d+$/, ''));
    return [];
  }
  function brief(id) {
    if (id.startsWith('n:')) { const n = nodes.get(id.slice(2)); return n && { id, type: n.kind === 'external' ? 'external' : 'module', name: n.label, description: n.summary || '' }; }
    if (id.startsWith('f:')) { const f = files.get(id.slice(2)); return f && { id, type: 'file', name: f.name, description: f.d || '', path: f.p }; }
    if (id.startsWith('r:')) { const r = routes[+id.slice(2)]; return r && { id, type: 'endpoint', name: r.name, description: r.d || '', path: `${r.m} ${r.p}` }; }
    if (id.startsWith('s:')) {
      const m = /^s:(.*)#(\d+)$/.exec(id); const f = m && files.get(m[1]); const s = f?.s?.[+m[2]];
      return s && { id, type: s[1], name: s[0], description: s[4] || '', path: `${f.p}:${s[2]}` };
    }
    return null;
  }
  const exists = (id) => !!brief(id);
  const inside = (x, container) => x === container || (container.startsWith('n:') && owners(x).includes(container.slice(2))) || (container.startsWith('f:') && (x.startsWith('r:') ? 'f:' + routes[+x.slice(2)].f === container : x.startsWith('s:') ? 'f:' + x.slice(2).replace(/#\d+$/, '') === container : false));
  const ownerItem = (endpoint) => endpoint.startsWith('f:') ? 'n:' + (files.get(endpoint.slice(2))?.n || '') : endpoint;

  /** Accepts an id, or what people naturally pass: a file path, a module id, or "GET /path". */
  function normId(id) {
    id = String(id || '').trim().replace(/^\.\//, '').replace(/\\/g, '/');
    if (brief(id)) return id;
    if (files.has(id)) return 'f:' + id;
    if (nodes.has(id)) return 'n:' + id;
    const m = /^([A-Z]+)\s+(\/\S*)$/i.exec(id);
    if (m) { const ri = routes.findIndex((r) => r.m === m[1].toUpperCase() && r.p === m[2]); if (ri >= 0) return 'r:' + ri; }
    return id;
  }

  const FILLER = new Set(['how', 'does', 'do', 'did', 'the', 'a', 'an', 'is', 'are', 'where', 'what', 'which', 'who', 'of', 'to', 'for', 'in', 'on', 'and', 'or', 'we', 'i', 'my', 'our', 'it', 'work', 'works', 'happen', 'happens', 'get', 'gets', 'with']);
  function find(query, kind, limit = 15) {
    const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
    const terms = words.filter((t) => !FILLER.has(t)).length ? words.filter((t) => !FILLER.has(t)) : words;
    if (!terms.length) return [];
    const pool = [];
    if (!kind || kind === 'module') for (const n of G.nodes) pool.push(['n:' + n.id, n.label, n.summary || '', n.id, 4]);
    if (!kind || kind === 'file') for (const f of G.files) pool.push(['f:' + f.p, f.name, f.d || '', f.p, 3]);
    if (!kind || kind === 'endpoint') routes.forEach((r, i) => pool.push(['r:' + i, r.name, r.d || '', `${r.m} ${r.p}`, 3]));
    if (!kind || kind === 'symbol') for (const f of G.files) (f.s || []).forEach((s, i) => pool.push([`s:${f.p}#${i}`, s[0], s[4] || '', f.p, 1]));
    // everything matching every word; if nothing does, the best partial matches
    const scored = [];
    for (const [id, name, desc, p, w] of pool) {
      const n = name.toLowerCase(), d = desc.toLowerCase(), pp = p.toLowerCase();
      let s = 0, hit = 0;
      for (const t of terms) {
        const sc = n === t ? 30 : n.startsWith(t) ? 20 : n.includes(t) ? 12 : pp.includes(t) ? 7 : d.includes(t) ? 5 : 0;
        if (sc) { s += sc; hit++; }
      }
      if (hit) scored.push([hit, s + w * 2 - n.length * 0.02, id]);
    }
    const best = Math.max(0, ...scored.map((x) => x[0]));
    const floor = best === terms.length ? best : Math.max(1, Math.ceil(terms.length / 2));
    return scored.filter((x) => x[0] >= floor).sort((a, b) => b[0] - a[0] || b[1] - a[1])
      .slice(0, Math.min(Number(limit) || 15, 40)).map(([, , id]) => brief(id));
  }

  function connections(id, max = 15) {
    const out = new Map(), inn = new Map();
    for (const l of G.links) {
      const ia = inside(l.a, id), ib = inside(l.b, id);
      if (ia === ib) continue;
      const other = ia ? l.b : l.a;
      const key = (id.startsWith('n:') ? ownerItem(other) : other) + '|' + l.k;
      const m = ia ? out : inn;
      const cur = m.get(key) || { id: key.split('|')[0], via: l.k, weight: 0, endpoints: new Set() };
      cur.weight += l.w;
      for (const [ri] of l.calls || []) if (ri != null) cur.endpoints.add(ri);
      m.set(key, cur);
    }
    const fmt = (m) => [...m.values()].sort((a, b) => b.weight - a.weight).slice(0, max).map((c) => ({
      ...brief(c.id), via: c.via, weight: c.weight,
      ...(c.endpoints.size ? { endpoints: [...c.endpoints].slice(0, 6).map((ri) => `r:${ri} ${routes[ri].m} ${routes[ri].p}`) } : {}),
    })).filter((x) => x.id);
    return { dependsOn: fmt(out), usedBy: fmt(inn) };
  }

  function show(id) {
    id = normId(id);
    const b = brief(id);
    if (!b) throw new Error(`Unknown id "${id}". Use find first; ids look like n:api, f:src/app.ts, r:12, s:src/app.ts#3.`);
    const parent = owners(id)[id.startsWith('n:') ? 1 : 0];
    const res = { ...b, ...(parent ? { partOf: brief('n:' + parent) && { id: 'n:' + parent, name: nodes.get(parent).label } } : {}) };
    const recent = (G.recent?.items || []).filter((x) => x.id === id);
    if (recent.length) res.recentWork = recent.map((x) => `${G.recent.tasks[x.task]?.title}: ${x.note}`);
    if (id.startsWith('n:')) {
      const n = nodes.get(id.slice(2));
      if (n.details) res.details = n.details;
      res.size = { files: n.stats.files, loc: n.stats.loc };
      res.children = (kidsOf.get(n.id) || []).map((k) => ({ id: 'n:' + k, name: nodes.get(k).label, description: nodes.get(k).summary || '' }));
      const fl = G.files.filter((f) => owners('f:' + f.p).includes(n.id)).sort((a, z) => z.loc - a.loc);
      res.files = fl.slice(0, 12).map((f) => ({ id: 'f:' + f.p, name: f.name, description: f.d || '' }));
      if (fl.length > 12) res.moreFiles = fl.length - 12;
      res.endpoints = routes.filter((r) => owners('f:' + r.f).includes(n.id)).length;
      Object.assign(res, connections(id));
    } else if (id.startsWith('f:')) {
      const f = files.get(id.slice(2));
      Object.assign(res, { loc: f.loc, module: { id: 'n:' + f.n, name: nodes.get(f.n)?.label }, ...(f.note ? { note: f.note } : {}) });
      const rs = routesByFile.get(f.p) || [];
      if (rs.length) res.endpoints = rs.slice(0, 40).map((ri) => ({ id: 'r:' + ri, method: routes[ri].m, path: routes[ri].p, name: routes[ri].name }));
      const handlers = new Set(rs.map((ri) => routes[ri].h));
      const ex = (f.s || []).map((s, i) => [s, i]).filter(([s]) => !handlers.has(s[0]));
      if (ex.length) res.exports = ex.slice(0, 30).map(([s, i]) => `s:${f.p}#${i} ${s[0]} (${s[1]})`);
      Object.assign(res, connections(id, 20));
    } else if (id.startsWith('r:')) {
      const ri = +id.slice(2), r = routes[ri];
      Object.assign(res, { method: r.m, routePath: r.p, handler: r.h, line: r.l, file: { id: 'f:' + r.f, name: files.get(r.f)?.name } });
      const callers = new Map();
      for (const l of G.links) { const n = (l.calls || []).filter(([x]) => x === ri).length; if (n) callers.set(l.a, (callers.get(l.a) || 0) + n); }
      res.calledFrom = [...callers.entries()].map(([a, n]) => ({ ...brief(a), calls: n }));
    } else {
      const m = /^s:(.*)#(\d+)$/.exec(id); const f = files.get(m[1]); const s = f.s[+m[2]];
      res.file = { id: 'f:' + f.p, name: f.name };
      res.importedBy = G.links.filter((l) => l.b === 'f:' + f.p && (l.names || []).some((nm) => nm === s[0] || (nm === 'default' && s[3]))).slice(0, 25).map((l) => brief(l.a));
    }
    return res;
  }

  /** Shortest dependency chain from anything inside `from` to anything inside `to`. */
  function path(from, to) {
    from = normId(from); to = normId(to);
    if (!exists(from) || !exists(to)) throw new Error('Unknown id; use find first.');
    const adj = new Map();
    const add = (a, b, l) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push([b, l]); };
    for (const l of G.links) add(l.a, l.b, l);
    const starts = [...new Set([...G.links.map((l) => l.a), ...G.links.map((l) => l.b)])].filter((x) => inside(x, from));
    const isGoal = (x) => inside(x, to);
    const prev = new Map(starts.map((s) => [s, null]));
    const queue = [...starts];
    let goal = null;
    while (queue.length && !goal) {
      const x = queue.shift();
      for (const [y, l] of adj.get(x) || []) {
        if (prev.has(y)) continue;
        prev.set(y, [x, l]);
        if (isGoal(y)) { goal = y; break; }
        queue.push(y);
      }
    }
    if (!goal) return { found: false, note: `No chain of imports/calls leads from ${from} to ${to}. Try the reverse direction, or the two may only meet through a shared dependency.` };
    const hops = [];
    for (let x = goal; prev.get(x); x = prev.get(x)[0]) {
      const [p, l] = prev.get(x);
      hops.unshift({ from: brief(p), to: brief(x), via: l.k, ...(l.calls?.length ? { endpoints: l.calls.slice(0, 3).map(([ri]) => ri != null ? `r:${ri} ${routes[ri].m} ${routes[ri].p}` : '').filter(Boolean) } : {}) });
    }
    return { found: true, hops: hops.slice(0, 15) };
  }

  function overview() {
    return {
      project: G.project.name, summary: G.project.summary || '',
      systems: G.nodes.filter((n) => !n.parent).map((n) => ({ id: 'n:' + n.id, name: n.label, kind: n.kind, description: n.summary || '', modules: (kidsOf.get(n.id) || []).map((k) => `n:${k} ${nodes.get(k).label}`) })),
      flows: (G.flows || []).map((f) => ({ title: f.title, steps: f.steps.map((s) => `${s.ref} ${s.note}`) })),
      counts: { files: G.files.length, endpoints: routes.length },
      ...(G.recent ? { recentWork: (G.recent.tasks || []).map((t, ti) => ({ title: t.title, request: t.request, summary: t.summary, changed: G.recent.items.filter((x) => x.task === ti).map((x) => `${x.id} ${x.note}`) })) } : {}),
    };
  }

  return { find, show, path, overview, exists, brief };
}

// What an answer looks like, for both engines (JSON Schema).
const FLOORPLAN_ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short title for the answer view, at most 6 words.' },
    answer: { type: 'string', description: 'The answer in Markdown, at most ~180 words. Mention map items inline as [[id]].' },
    items: { type: 'array', description: '3-14 map items most relevant to the answer, most important first.', items: { type: 'object', properties: { id: { type: 'string' }, note: { type: 'string', description: 'Why this item matters here, at most 15 words.' } }, required: ['id', 'note'] } },
    steps: { type: 'array', description: 'Optional ordered walkthrough when the answer is a sequence (a request path, a data flow). Empty otherwise.', items: { type: 'object', properties: { id: { type: 'string' }, note: { type: 'string' } }, required: ['id', 'note'] } },
    followups: { type: 'array', description: '2-3 short follow-up questions the person might ask next.', items: { type: 'string' } },
  },
  required: ['title', 'answer', 'items'],
};

// A requested flow: an ordered walkthrough of map items (JSON Schema).
const FLOORPLAN_FLOW_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'Short flow title, at most 6 words, e.g. "Checkout to Stripe payment".' },
    description: { type: 'string', description: 'One sentence on what the flow shows.' },
    steps: { type: 'array', description: '3-9 steps in the order things happen, each a map item and what happens there.', items: { type: 'object', properties: { id: { type: 'string' }, note: { type: 'string', description: 'What happens at this step, at most 18 words.' } }, required: ['id', 'note'] } },
  },
  required: ['title', 'steps'],
};

// A requested change to a blueprint: the whole updated plan.json and architecture.json, and what changed
// (JSON Schema). The documents travel as JSON text so the schema stays the same for every engine.
const FLOORPLAN_CHANGE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'What changed, 2-6 words, e.g. "Planned out payments".' },
    summary: { type: 'string', description: 'Markdown, at most ~150 words, plain words: what you added, changed or removed and why, plus any new assumptions or open questions.' },
    plan: { type: 'string', description: 'The complete updated floorplan/plan.json, as JSON text.' },
    architecture: { type: 'string', description: 'The complete updated floorplan/architecture.json, as JSON text.' },
    changes: { type: 'array', description: 'Every new or changed card: a file path, node id or "METHOD /path".', items: { type: 'object', properties: { ref: { type: 'string' }, change: { type: 'string', enum: ['new', 'changed'] }, note: { type: 'string', description: 'How this card serves the request, one plain sentence.' } }, required: ['ref', 'change', 'note'] } },
    followups: { type: 'array', description: '2-3 short changes the person might ask for next.', items: { type: 'string' } },
  },
  required: ['title', 'summary', 'plan', 'architecture', 'changes'],
};

function floorplanChangeInstructions(G) {
  const src = G.meta?.blueprint?.source;
  return [
    `You change a blueprint: an interactive map of "${G.project.name}", a system that is planned but not built yet. The person looking at it asks for a change, addition or removal ("also plan out payments", "drop the admin page", "staff should sign in with Google"), and you update the plan.`,
    `Read floorplan/plan.json and floorplan/architecture.json first${src ? `, and ${src} (the PRD it was planned from) when the request touches what the PRD says` : ''}. You can look things up on the map with \`node floorplan/query.mjs find "<words>"\` and \`show <id>\`.`,
    'plan.json format: { source, stack[], assumptions[], questions[{question, about[]}], files[{path, name, description, screen?, uses[], calls["METHOD /path"], services[node ids], data[node ids]}], endpoints[{method, path, file, name, description, access: public|signed-in|team|webhook|internal, who?, publicBecause?}] }. Every endpoint\'s file is a planned file, every call matches a planned endpoint exactly, and services/data name nodes in architecture.json.',
    'architecture.json: { project, nodes[{id, label, kind, parent?, summary, paths[globs]}], edges[], flows[{id, title, steps[{node, note}]}], tour[] }. Kinds: ui service worker library feature data config test script infra external. External nodes (outside services, the database) own no files. Every planned file must fall under some node\'s paths, so add or widen globs for new folders. Flow and tour steps point at node ids or planned file paths.',
    'Change only what the request needs, the way the rest of the plan is written: same stack and conventions, plain language for everyone, real file paths. Keep every other file, endpoint, id and description exactly as it is. If the PRD or plan already decided something, follow it; record a new choice in assumptions and a real open decision in questions. If the request removes something, remove everything that only it used. If it answers one of plan.json\'s questions, remove that question, build the answer into the plan, and record it in assumptions; if it settles who may use an endpoint, set access (and who or publicBecause). Many requests come from the map\'s design review: settle exactly what it names.',
    'Reply with JSON only: {"title", "summary", "plan", "architecture", "changes", "followups"}. plan and architecture are the complete updated files as JSON text, not just the changed parts. changes lists every new or changed file, endpoint ("METHOD /path") or node id with a note on how it serves the request.',
    'Do not edit any files yourself: the map server checks your JSON, saves it and redraws the map.',
  ].join('\n');
}

function floorplanFlowInstructions(G, engine) {
  return [
    `You build guided flows for an interactive architecture map of the codebase "${G.project.name}". A flow is an ordered walkthrough: each step is one map item (module n:..., file f:..., endpoint r:..., or export s:...) and a note on what happens there.`,
    engine === 'cli'
      ? 'Find the items with `node floorplan/query.mjs find "<words>"`, `show <id>` and `path <fromId> <toId>`; read source files when you need to confirm the order of events.'
      : 'Find the items with the tools find_items, get_item and dependency_path.',
    'Trace what the person asks for from its trigger (a user action, webhook, cron job) to its final effect (database write, external call, response).',
    'Use 3-9 steps. Prefer the most specific item that tells the story (an endpoint over its file, a file over its module), and make consecutive steps things that really call or import each other.',
    'Reply with JSON only: {"title", "description", "steps": [{"id", "note"}]}. Only use ids the map gave you.',
  ].join('\n');
}

function floorplanAskInstructions(G, engine) {
  const tools = engine === 'cli'
    ? `Query the map from the shell: \`node floorplan/query.mjs overview\`, \`node floorplan/query.mjs find "<words>" [--kind module|file|endpoint|symbol]\`, \`node floorplan/query.mjs show <id>\`, \`node floorplan/query.mjs path <fromId> <toId>\`. Every result is JSON with ids. Start with the map; read or grep source files when you need specifics the map does not have.`
    : `Use the tools find_items, get_item and dependency_path to explore the map. You cannot read source files, so answer from the map's names, descriptions, endpoints and connections, and say so when a question needs the code itself.`;
  const bp = G.meta?.blueprint;
  return [
    `You answer questions about the codebase "${G.project.name}" for someone exploring an interactive architecture map of it.`,
    `The map has cards for modules (ids n:...), files (f:<path>), HTTP endpoints (r:<number>) and exported symbols (s:<path>#<number>), each with a human-readable name and description, connected by imports and HTTP calls.`,
    tools,
    bp ? `This map is a blueprint: a plan of a system that hasn't been built yet, so its files don't exist.${engine === 'cli' ? ` Instead of source files, read floorplan/plan.json${bp.source ? ` and ${bp.source} (what it was planned from)` : ''} when you need more than the map.` : ''} Answer about what would be built and why, and say plainly when the plan doesn't cover something.` : '',
    'Use a few lookups, not dozens. Then reply with JSON only: {"title", "answer", "items", "steps", "followups"}.',
    '- answer: Markdown, at most ~180 words, plain and specific. Refer to map items inline as [[id]] (they become clickable).',
    '- items: the 3-14 cards that best show the answer, most important first, each with a note (at most 15 words) on its role.',
    '- steps: an ordered walkthrough when the answer is a sequence (a request path, a data flow); otherwise [].',
    '- followups: 2-3 short follow-up questions.',
    'Only use ids that the map gave you.',
  ].filter(Boolean).join('\n');
}

// ---- cli ----
// floorplan/query.mjs: look things up in this folder's graph.json. Generated by build.mjs; the Claude
// Code CLI calls it when you ask questions from the map (node floorplan/serve.mjs).
//
// usage: node floorplan/query.mjs overview
//        node floorplan/query.mjs find "<words>" [--kind module|file|endpoint|symbol] [--limit 15]
//        node floorplan/query.mjs show <id>
//        node floorplan/query.mjs path <fromId> <toId>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const G = JSON.parse(fs.readFileSync(path.join(here, 'graph.json'), 'utf8').replace(/^\uFEFF/, ''));
const q = createGraphQuery(G);
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf('--' + name); if (i < 0) return undefined; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const kind = flag('kind'), limit = flag('limit');
const [cmd, ...rest] = argv;
try {
  let out;
  if (cmd === 'overview') out = q.overview();
  else if (cmd === 'find') out = q.find(rest.join(' '), kind, limit);
  else if (cmd === 'show') out = q.show(rest[0]);
  else if (cmd === 'path') out = q.path(rest[0], rest[1]);
  else { console.log('commands: overview | find "<words>" [--kind module|file|endpoint|symbol] | show <id> | path <fromId> <toId>'); process.exit(cmd ? 1 : 0); }
  console.log(JSON.stringify(out, null, 1));
} catch (e) {
  console.log(JSON.stringify({ error: e.message }));
  process.exit(1);
}
