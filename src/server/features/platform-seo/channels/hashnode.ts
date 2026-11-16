import { z } from "zod";
import { type ChannelResult, fail, ok, TIMEOUT_MS } from "./channelResult";

// Hashnode GraphQL API. Since 2026-05 it lives at gql-beta.hashnode.com (the
// old gql.hashnode.com redirects to an announcement) and every call needs the
// publication on a Pro plan. A Personal Access Token goes in Authorization.
// Drafts: createDraft / updateDraft, then publishDraft makes the post;
// updatePost edits a live one. Refusals come back as HTTP 200 with errors[].
const ENDPOINT = "https://gql-beta.hashnode.com/";
// The API caps a request body at 100 KB.
export const HASHNODE_MAX_BODY_BYTES = 95_000;

const errorsSchema = z.object({
  errors: z
    .array(
      z.object({
        message: z.string(),
        extensions: z.object({ code: z.string().optional() }).optional(),
      }),
    )
    .min(1),
});

export type HashnodePostInput = {
  title: string;
  subtitle: string | null;
  contentMarkdown: string;
  tags: { slug: string; name: string }[];
  originalArticleURL: string | null;
};

async function graphql<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
  dataSchema: z.ZodType<T>,
): Promise<ChannelResult<T>> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "OpenSEO",
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Workers have no redirect: "error"; a redirect is never followed and
      // reads as unavailable below.
      redirect: "manual",
    });
  } catch {
    return fail("unavailable", "Hashnode did not respond. Try again shortly.");
  }
  const body: unknown = await response.json().catch(() => null);
  const errors = errorsSchema.safeParse(body);
  if (errors.success) {
    const [first] = errors.data.errors;
    switch (first.extensions?.code) {
      case "UNAUTHENTICATED":
        return fail(
          "bad_token",
          "Hashnode rejected the token. Create a new one in Hashnode → Account settings → Developer and connect again.",
        );
      case "FORBIDDEN":
        return /pro plan/i.test(first.message)
          ? fail(
              "pro_required",
              "Hashnode's API only works for blogs on a Pro plan. Upgrade the blog in your Hashnode dashboard, then try again.",
            )
          : fail(
              "forbidden",
              "This Hashnode account can't publish to the blog (contributors can only submit drafts for review).",
            );
      case "NOT_FOUND":
        return fail("not_found", "Hashnode no longer has this draft or post.");
      case "BAD_USER_INPUT":
        return fail(
          "rejected",
          `Hashnode rejected the post: ${first.message.slice(0, 300)}`,
        );
      default:
        return fail(
          "unavailable",
          "Hashnode had a problem with the request. Try again shortly.",
        );
    }
  }
  if (!response.ok) {
    return fail(
      "unavailable",
      `Hashnode is unavailable (HTTP ${response.status}). Try again shortly.`,
    );
  }
  const parsed = z.object({ data: dataSchema }).safeParse(body);
  return parsed.success
    ? ok(parsed.data.data)
    : fail("unavailable", "Hashnode returned an unexpected response.");
}

const publicationsSchema = z.object({
  me: z.object({
    username: z.string(),
    publications: z.object({
      edges: z.array(
        z.object({
          node: z.object({
            id: z.string(),
            title: z.string(),
            url: z.string().nullable(),
          }),
        }),
      ),
    }),
  }),
});

export async function listHashnodePublications(token: string) {
  const result = await graphql(
    token,
    "query { me { username publications(first: 20) { edges { node { id title url } } } } }",
    {},
    publicationsSchema,
  );
  return result.ok
    ? ok({
        username: result.value.me.username,
        publications: result.value.me.publications.edges.map((e) => e.node),
      })
    : result;
}

const draftSchema = z.object({ draft: z.object({ id: z.string() }) });
const postSchema = z.object({
  post: z.object({ id: z.string(), url: z.string(), publishedAt: z.string() }),
});

export async function createHashnodeDraft(
  token: string,
  publicationId: string,
  input: HashnodePostInput,
) {
  const result = await graphql(
    token,
    "mutation ($input: CreateDraftInput!) { createDraft(input: $input) { draft { id } } }",
    { input: { publicationId, ...input } },
    z.object({ createDraft: draftSchema }),
  );
  return result.ok ? ok({ id: result.value.createDraft.draft.id }) : result;
}

export async function updateHashnodeDraft(
  token: string,
  draftId: string,
  input: HashnodePostInput,
) {
  const result = await graphql(
    token,
    "mutation ($input: UpdateDraftInput!) { updateDraft(input: $input) { draft { id } } }",
    { input: { draftId, ...input } },
    z.object({ updateDraft: draftSchema }),
  );
  return result.ok ? ok({ id: result.value.updateDraft.draft.id }) : result;
}

export async function publishHashnodeDraft(token: string, draftId: string) {
  const result = await graphql(
    token,
    "mutation ($input: PublishDraftInput!) { publishDraft(input: $input) { post { id url publishedAt } } }",
    { input: { draftId } },
    z.object({ publishDraft: postSchema }),
  );
  return result.ok ? ok(result.value.publishDraft.post) : result;
}

export async function updateHashnodePost(
  token: string,
  postId: string,
  input: HashnodePostInput,
) {
  const result = await graphql(
    token,
    "mutation ($input: UpdatePostInput!) { updatePost(input: $input) { post { id url publishedAt } } }",
    { input: { id: postId, ...input } },
    z.object({ updatePost: postSchema }),
  );
  return result.ok ? ok(result.value.updatePost.post) : result;
}
