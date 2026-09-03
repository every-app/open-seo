import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkAiCrawlerAccess,
  checkLlmsTxt,
  fetchLlmsTxt,
  findLlmsTxtStructureProblem,
} from "@/server/lib/audit/issues/ai-readiness";

// The SSRF guard does DNS/network work; make it an identity in tests so the
// redirect paths are exercised without touching the network.
vi.mock("@/server/lib/audit/url-policy", () => ({
  normalizeAndValidateStartUrl: async (u: string) => u,
}));

const ORIGIN = "https://example.com";

function mockFetchSequence(responses: Response[]) {
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => responses[i++]),
  );
}

function streamOf(totalBytes: number): ReadableStream<Uint8Array> {
  const chunk = new TextEncoder().encode("x".repeat(100_000));
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= totalBytes) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
      sent += chunk.byteLength;
    },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("checkAiCrawlerAccess", () => {
  it("reports nothing when robots.txt is missing", () => {
    expect(checkAiCrawlerAccess(ORIGIN, null)).toEqual([]);
  });

  it("reports nothing when robots.txt allows everyone", () => {
    expect(checkAiCrawlerAccess(ORIGIN, "User-agent: *\nAllow: /\n")).toEqual(
      [],
    );
  });

  it("groups specifically blocked agents by purpose as a readable string", () => {
    const robots = [
      "User-agent: GPTBot",
      "Disallow: /",
      "",
      "User-agent: ClaudeBot",
      "Disallow: /",
      "",
      "User-agent: PerplexityBot",
      "Disallow: /",
      "",
      "User-agent: ChatGPT-User",
      "Disallow: /",
      "",
      "User-agent: *",
      "Allow: /",
    ].join("\n");

    const issues = checkAiCrawlerAccess(ORIGIN, robots);
    const byType = new Map(issues.map((issue) => [issue.issueType, issue]));

    expect(byType.size).toBe(3);
    expect(
      byType.get("ai-training-crawlers-blocked")?.details?.blockedAgents,
    ).toBe("GPTBot (OpenAI), ClaudeBot (Anthropic)");
    expect(
      byType.get("ai-search-crawlers-blocked")?.details?.blockedAgents,
    ).toBe("PerplexityBot (Perplexity)");
    expect(
      byType.get("ai-user-fetchers-blocked")?.details?.blockedAgents,
    ).toBe("ChatGPT-User (OpenAI)");
  });

  it("anchors issues to robots.txt with no page id and a stable dedupe key", () => {
    const [issue] = checkAiCrawlerAccess(ORIGIN, "User-agent: GPTBot\nDisallow: /\n");
    expect(issue.pageId).toBeNull();
    expect(issue.pageUrl).toBe(`${ORIGIN}/robots.txt`);
    expect(issue.dedupeKey).toBe("training");
  });

  it("stays silent when the whole site is closed to the generic agent", () => {
    expect(checkAiCrawlerAccess(ORIGIN, "User-agent: *\nDisallow: /\n")).toEqual(
      [],
    );
  });

  it("ignores agents only blocked from subpaths", () => {
    expect(
      checkAiCrawlerAccess(ORIGIN, "User-agent: GPTBot\nDisallow: /private/\n"),
    ).toEqual([]);
  });
});

describe("findLlmsTxtStructureProblem", () => {
  it("accepts a minimal spec-compliant file", () => {
    expect(findLlmsTxtStructureProblem("# Example Corp\n")).toBeNull();
  });

  it("tolerates leading blank lines before the H1", () => {
    expect(findLlmsTxtStructureProblem("\n\n# Example Corp\n")).toBeNull();
  });

  it("flags an empty file", () => {
    expect(findLlmsTxtStructureProblem("  \n\n")).toBe("file-empty");
  });

  it("flags a file that does not start with an H1", () => {
    expect(findLlmsTxtStructureProblem("Example Corp\n## Docs\n")).toBe(
      "missing-h1-title",
    );
  });

  it("does not mistake an H2 for the required H1", () => {
    expect(findLlmsTxtStructureProblem("## Docs\n")).toBe("missing-h1-title");
  });
});

describe("checkLlmsTxt", () => {
  it("reports missing-llms-txt when the file is absent", () => {
    expect(checkLlmsTxt(ORIGIN, { status: "missing" })).toEqual([
      { issueType: "missing-llms-txt", pageId: null, pageUrl: `${ORIGIN}/llms.txt` },
    ]);
  });

  it("stays silent when the fetch failed", () => {
    expect(checkLlmsTxt(ORIGIN, { status: "unreachable" })).toEqual([]);
  });

  it("reports nothing for a valid file", () => {
    expect(
      checkLlmsTxt(ORIGIN, { status: "found", text: "# Example Corp\n" }),
    ).toEqual([]);
  });

  it("reports llms-txt-invalid with the specific problem", () => {
    expect(
      checkLlmsTxt(ORIGIN, { status: "found", text: "just some text\n" }),
    ).toEqual([
      {
        issueType: "llms-txt-invalid",
        pageId: null,
        pageUrl: `${ORIGIN}/llms.txt`,
        details: { problem: "missing-h1-title" },
      },
    ]);
  });
});

describe("fetchLlmsTxt", () => {
  it("returns the file on a direct 200", async () => {
    mockFetchSequence([
      new Response("# Example Corp\n", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    ]);
    expect(await fetchLlmsTxt(ORIGIN)).toEqual({
      status: "found",
      text: "# Example Corp\n",
    });
  });

  it("follows a single same-origin redirect", async () => {
    mockFetchSequence([
      new Response(null, {
        status: 302,
        headers: { location: `${ORIGIN}/llms.txt?v=2` },
      }),
      new Response("# Example Corp\n", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    ]);
    expect(await fetchLlmsTxt(ORIGIN)).toEqual({
      status: "found",
      text: "# Example Corp\n",
    });
  });

  it("refuses a cross-origin redirect (SSRF guard)", async () => {
    mockFetchSequence([
      new Response(null, {
        status: 301,
        headers: { location: "https://evil.example.net/llms.txt" },
      }),
    ]);
    expect(await fetchLlmsTxt(ORIGIN)).toEqual({ status: "missing" });
  });

  it("rejects an oversized body via the bounded reader", async () => {
    mockFetchSequence([
      new Response(streamOf(2_200_000), {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    ]);
    expect(await fetchLlmsTxt(ORIGIN)).toEqual({ status: "missing" });
  });

  it("treats an HTML body (SPA catch-all) as no llms.txt", async () => {
    mockFetchSequence([
      new Response("<!doctype html><html></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    ]);
    expect(await fetchLlmsTxt(ORIGIN)).toEqual({ status: "missing" });
  });

  it("reports missing on 404", async () => {
    mockFetchSequence([new Response(null, { status: 404 })]);
    expect(await fetchLlmsTxt(ORIGIN)).toEqual({ status: "missing" });
  });
});
