#!/usr/bin/env node
// Run fresh, isolated Codex sessions against a candidate skill on the local
// SEOShark backend. One session per --site, all in parallel. See ../SKILL.md.
//
//   node .agents/skills/evaluate-skill/scripts/run.mjs \
//     --skill seo-audit --site example.com --site holdout.example \
//     --endpoint http://<local-dev-host>/mcp [--brief "..."] [--out .logs/skill-eval-<ts>]
//
// Each run gets: a frozen copy of the skill (plus seo-report) in a fresh /tmp
// folder, a new local project seeded only with the brief, and a per-run MCP
// gateway that allows a fixed tool list and rejects any other project id.
// Artifacts land in --out: manifest.json, <run>-report.html, <run>-mcp.jsonl,
// <run>-events.jsonl, <run>-result.md, run.log.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile, appendFile, cp } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const all = (name) =>
  args.flatMap((a, i) => (a === name ? [args[i + 1]] : []));

const skill = opt("--skill", "seo-audit");
const sites = all("--site");
const briefs = all("--brief");
const upstream = opt("--endpoint");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const out = path.resolve(opt("--out", `.logs/skill-eval-${stamp}`));
if (sites.length === 0 || !upstream) {
  console.error("Pass --endpoint <local MCP URL> and at least one --site <domain>");
  process.exit(1);
}

const allowed = new Set([
  "whoami",
  "get_project_context",
  "update_project_context",
  "run_site_audit",
  "get_audit_status",
  "get_audit_issues",
  "get_audit_pages",
  "get_domain_overview",
  "get_ranked_keywords",
  "get_backlinks_overview",
  "get_backlinks_profile",
  "get_keyword_metrics",
  "research_keywords",
  "get_serp_results",
  "get_search_console_performance",
  "list_reports",
  "get_report",
  "list_report_templates",
  "save_report",
]);

let seq = 0;
async function rpc(name, params) {
  const r = await fetch(upstream, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: ++seq,
      method: "tools/call",
      params: { name, arguments: params },
    }),
  });
  const d = await r.json();
  if (d.error || d.result?.isError) throw new Error(JSON.stringify(d));
  return d.result.structuredContent;
}

const sha = async (p) =>
  createHash("sha256")
    .update(await readFile(p))
    .digest("hex");

await mkdir(out, { recursive: true });
const identity = await rpc("whoami", {});
if (identity.mode !== "self-hosted") {
  console.error("Refusing to run against a non-local backend:", identity);
  process.exit(1);
}

const workspace = await mkdtemp(path.join(tmpdir(), "openseo-skill-eval-"));
const manifest = {
  skill,
  upstream,
  workspace,
  startedAt: new Date().toISOString(),
  model: "Codex CLI configured default, no override",
  reasoning: "high",
  skillHash: await sha(`.agents/skills/${skill}/SKILL.md`),
  reportSkillHash: await sha(".agents/skills/seo-report/SKILL.md"),
  runs: {},
};

for (const [i, domain] of sites.entries()) {
  const name = `${domain.replace(/[^a-z0-9]+/gi, "-")}-${i + 1}`;
  const folder = path.join(workspace, name);
  await mkdir(path.join(folder, ".agents/skills"), { recursive: true });
  for (const s of new Set([skill, "seo-report"])) {
    await cp(`.agents/skills/${s}`, path.join(folder, ".agents/skills", s), {
      recursive: true,
    });
  }
  const brief =
    briefs[i] ??
    briefs[0] ??
    `Evaluation brief: the business at ${domain}. Verify its offering and audience from the public website. The goal is to attract relevant organic visitors who could become customers. No first-party analytics are connected.`;
  const project = await rpc("create_project", {
    name: `Skill eval ${skill} ${name} ${manifest.startedAt}`,
    domain,
    locationCode: 2840,
    languageCode: "en",
  });
  const projectId = project.project.id;
  await rpc("update_project_context", {
    projectId,
    updates: [{ section: "business_overview", content: brief }],
  });
  manifest.runs[name] = { domain, brief, folder, projectId };
}
await writeFile(
  path.join(out, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);

async function start(name, run) {
  const log = path.join(out, `${name}-mcp.jsonl`);
  let calls = 0;
  let failures = 0;
  const gateway = createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks).toString();
      const input = body ? JSON.parse(body) : null;
      if (req.method !== "POST" || !input) {
        res.writeHead(405);
        res.end();
        return;
      }
      const reply = (payload) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(payload));
      };
      if (input.method === "tools/call") {
        const { name: tool, arguments: a = {} } = input.params ?? {};
        if (
          !allowed.has(tool) ||
          (tool !== "whoami" && a.projectId !== run.projectId)
        ) {
          await appendFile(
            log,
            JSON.stringify({ at: new Date().toISOString(), blocked: true, input }) +
              "\n",
          );
          reply({
            jsonrpc: "2.0",
            id: input.id,
            result: {
              isError: true,
              content: [
                {
                  type: "text",
                  text: "This evaluation endpoint only allows approved tools for the assigned project.",
                },
              ],
            },
          });
          return;
        }
      } else if (
        !["initialize", "notifications/initialized", "ping", "tools/list"].includes(
          input.method,
        )
      ) {
        reply({
          jsonrpc: "2.0",
          id: input.id,
          error: { code: -32601, message: "Method unavailable in evaluation" },
        });
        return;
      }
      const up = await fetch(upstream, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(240000),
      });
      const raw = await up.text();
      const data = raw ? JSON.parse(raw) : null;
      if (input.method === "tools/list" && data?.result?.tools) {
        data.result.tools = data.result.tools.filter((t) => allowed.has(t.name));
      }
      if (input.method === "tools/call") {
        calls++;
        if (data?.error || data?.result?.isError) failures++;
        await appendFile(
          log,
          JSON.stringify({ at: new Date().toISOString(), input, response: data }) +
            "\n",
        );
        if (input.params.name === "save_report" && !data?.result?.isError) {
          await writeFile(
            path.join(out, `${name}-report.html`),
            input.params.arguments.html,
          );
          await writeFile(
            path.join(out, `${name}-saved.json`),
            JSON.stringify(data.result.structuredContent, null, 2),
          );
        }
      }
      res.writeHead(up.status, { "content-type": "application/json" });
      res.end(data ? JSON.stringify(data) : "");
    } catch (e) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: String(e) }));
    }
  });
  await new Promise((resolve) => gateway.listen(0, "127.0.0.1", resolve));
  run.endpoint = `http://127.0.0.1:${gateway.address().port}/mcp`;

  const probe = await fetch(run.endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 999,
      method: "tools/call",
      params: {
        name: "get_project_context",
        arguments: { projectId: "different-project" },
      },
    }),
  });
  if (!(await probe.json()).result?.isError) throw new Error("Isolation probe failed");

  const prompt = `Use the supplied .agents/skills/${skill}/SKILL.md and .agents/skills/seo-report/SKILL.md to work on https://${run.domain}. Read those exact local files. Produce a useful result with enough investigation to support your conclusions.

Your only SEOShark project is ${run.projectId}. Its local MCP endpoint is ${run.endpoint}. You are authorized to perform the research and save a completed report there. Do not access any other SEOShark project or production app/connector. Do not read prior reports, evaluator materials, personal memories, or files outside this working folder. Use only these supplied skills; do not substitute a globally installed skill.

The project's business brief is sufficient to start. Verify details from the website; if further business details are unavailable, state reasonable assumptions and continue without questions. First-party analytics are not connected. External public-web reading is allowed. Do not submit forms or alter the audited website.

Save evidence and notes inside this working folder. Deliver the report using local save_report and include its link in your final answer. Do not edit the supplied skills. If no second reviewer tool is available, perform the skill's self-review.
`;
  await writeFile(path.join(run.folder, "prompt.txt"), prompt);
  const codexArgs = [
    "exec",
    "--ignore-user-config",
    "--ephemeral",
    "--skip-git-repo-check",
    "--cd",
    run.folder,
    "--sandbox",
    "workspace-write",
    "--disable",
    "apps",
    "--disable",
    "plugins",
    "--disable",
    "multi_agent",
    "-c",
    "memories.use_memories=false",
    "-c",
    "memories.generate_memories=false",
    "-c",
    'model_reasoning_effort="high"',
    "-c",
    "sandbox_workspace_write.network_access=true",
    "-c",
    'web_search="live"',
    "-c",
    `mcp_servers.openseo-local.url=${JSON.stringify(run.endpoint)}`,
    "-c",
    "mcp_servers.openseo-local.required=true",
    "-c",
    'mcp_servers.openseo-local.default_tools_approval_mode="approve"',
    "--json",
    "--output-last-message",
    path.join(run.folder, "result.md"),
    "-",
  ];
  const child = spawn("codex", codexArgs, {
    cwd: run.folder,
    stdio: ["pipe", "pipe", "pipe"],
  });
  run.startedAt = new Date().toISOString();
  child.stdout.pipe(createWriteStream(path.join(out, `${name}-events.jsonl`)));
  child.stderr.pipe(createWriteStream(path.join(out, `${name}-stderr.log`)));
  child.stdin.end(prompt);
  console.log("START", name, "project", run.projectId);
  const timer = setInterval(
    () => console.log("PROGRESS", name, calls, "MCP calls", failures, "errors"),
    30000,
  );
  const code = await new Promise((resolve, reject) => {
    child.on("exit", resolve);
    child.on("error", reject);
  });
  clearInterval(timer);
  Object.assign(run, {
    finishedAt: new Date().toISOString(),
    exitCode: code,
    mcpCalls: calls,
    mcpErrors: failures,
  });
  gateway.close();
  try {
    await cp(path.join(run.folder, "result.md"), path.join(out, `${name}-result.md`));
  } catch {
    // no final message; the events log still has the run
  }
  console.log("DONE", name, "exit", code, "calls", calls, "errors", failures);
}

await Promise.all(Object.entries(manifest.runs).map(([n, r]) => start(n, r)));
await writeFile(
  path.join(out, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);
console.log("ALL RUNS COMPLETE", out);
