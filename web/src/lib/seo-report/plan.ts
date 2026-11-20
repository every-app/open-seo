import { z } from "zod";

// The plan a report opens with: the pages most worth building or reworking,
// best first. The model hands each one in as fields, not prose, so the first
// page can draw them the same way every time and the number beside a move is
// the move's own.

/** How many moves a plan may hold. */
export const MAX_MOVES = 3;

export const moveSchema = z.strictObject({
  action: z
    .string()
    .max(200)
    .describe(
      'What to do, verb first, naming the page: "Rework the pricing page into a worked monthly bill".',
    ),
  page: z
    .string()
    .max(300)
    .nullable()
    .describe("The address of the page to rework. Null for a new page."),
  keyword: z.string().max(80).describe("The lead keyword the page targets."),
  searches: z
    .number()
    .nonnegative()
    .nullable()
    .describe("The keyword's estimated monthly searches. Null when unknown."),
  difficulty: z
    .number()
    .min(0)
    .max(100)
    .nullable()
    .describe("The keyword's difficulty out of 100. Null when unknown."),
  holders: z
    .string()
    .max(300)
    .describe(
      "Who is on page one now: up to three names with their positions, then what kind of pages they are.",
    ),
  steps: z
    .array(z.string().max(300))
    .min(1)
    .max(4)
    .describe(
      "The steps to build the page, in the order to build it. Each starts with a verb and names one thing to make that page one lacks.",
    ),
  why: z
    .string()
    .max(300)
    .describe("A few words on why this move sits where it does in the plan."),
});
export type Move = z.infer<typeof moveSchema>;
