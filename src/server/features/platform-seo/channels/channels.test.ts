import { afterEach, describe, expect, it, vi } from "vitest";
import { createDevtoDraft, updateDevtoArticle } from "./devto";
import { createHashnodeDraft } from "./hashnode";

// The request each platform documents, and its refusals turned into messages
// the user can act on.

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockReset());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

// The JSON body of the nth request.
function sentBody(call: number): unknown {
  const body = fetchMock.mock.calls[call][1]?.body;
  if (typeof body !== "string") throw new Error("no JSON body");
  return JSON.parse(body);
}

const devtoInput = {
  title: "T",
  bodyMarkdown: "B",
  description: null,
  tags: ["seo"],
  canonicalUrl: "https://acme.com/t",
  aiDisclosure: "some_ai" as const,
};
const hashnodeInput = {
  title: "T",
  subtitle: null,
  contentMarkdown: "B",
  tags: [{ slug: "seo", name: "seo" }],
  originalArticleURL: null,
};

describe("Dev.to", () => {
  it("creates an unpublished article with the v1 headers, then publishes by id", async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        { id: 7, url: "https://dev.to/a/t-temp-slug-1", published_at: null },
        201,
      ),
    );
    expect(await createDevtoDraft("key", devtoInput)).toEqual({
      ok: true,
      value: {
        id: "7",
        url: "https://dev.to/a/t-temp-slug-1",
        publishedAt: null,
      },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://dev.to/api/articles");
    expect(init?.headers).toMatchObject({
      "api-key": "key",
      Accept: "application/vnd.forem.api-v1+json",
    });
    expect(sentBody(0)).toEqual({
      article: {
        title: "T",
        body_markdown: "B",
        tags: ["seo"],
        canonical_url: "https://acme.com/t",
        ai_disclosure_level: "some_ai",
        published: false,
      },
    });

    fetchMock.mockResolvedValueOnce(
      json({
        id: 7,
        url: "https://dev.to/a/t-1",
        published_at: "2026-11-16T00:00:00Z",
      }),
    );
    await updateDevtoArticle("key", "7", devtoInput, true);
    const [putUrl] = fetchMock.mock.calls[1];
    expect(putUrl).toBe("https://dev.to/api/articles/7");
    expect(sentBody(1)).toMatchObject({ article: { published: true } });
  });

  it("passes Dev.to's validation message through", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ error: "Tag list exceed the max of 4 tags", status: 422 }, 422),
    );
    expect(await createDevtoDraft("key", devtoInput)).toEqual({
      ok: false,
      problem: {
        kind: "rejected",
        message:
          "Dev.to rejected the article: Tag list exceed the max of 4 tags",
      },
    });
  });
});

describe("Hashnode", () => {
  it("posts to gql-beta and says when the blog needs Pro", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        data: null,
        errors: [
          {
            message:
              "Publication does not have an active Pro plan. Upgrade in your dashboard to access this via the API.",
            extensions: { code: "FORBIDDEN" },
          },
        ],
      }),
    );
    const result = await createHashnodeDraft("pat", "pub1", hashnodeInput);
    expect(result).toMatchObject({
      ok: false,
      problem: { kind: "pro_required" },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gql-beta.hashnode.com/");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer pat" });
    expect(sentBody(0)).toMatchObject({
      variables: { input: { publicationId: "pub1", ...hashnodeInput } },
    });
  });
});
