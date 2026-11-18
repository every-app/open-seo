import { expect, it } from "vitest";
import { toTrustpilotSnapshot } from "../src/lib/trustpilot-snapshot.js";

// Shapes as documented for Trustpilot's Business Units and Service Reviews APIs.
const review = (id: string) => ({
  id,
  stars: 5,
  createdAt: "2026-11-13T21:44:07Z",
  title: "Great",
  text: "Works well.",
  consumer: { displayName: "Sam" },
});

const responses = (ids: string[]) => ({
  businessUnit: {
    score: { trustScore: 4.7, stars: 4.5 },
    numberOfReviews: { total: 40 },
  },
  reviews: { reviews: ids.map(review) },
  reviewUrls: Object.fromEntries(
    ids.map((id) => [id, `https://www.trustpilot.com/reviews/${id}`]),
  ),
});

it("rejects a response without reviews, so the last copy stays on the site", () => {
  // What Trustpilot answers when the SelectedReview tag matches nothing.
  expect(() => toTrustpilotSnapshot(responses([]), "now")).toThrow();
  expect(toTrustpilotSnapshot(responses(["a", "b", "c"]), "now")).toMatchObject(
    {
      trustScore: 4.7,
      totalReviews: 40,
      reviews: [
        {
          name: "Sam",
          date: "2026-11-13",
          url: "https://www.trustpilot.com/reviews/a",
        },
        {},
        {},
      ],
    },
  );
});
