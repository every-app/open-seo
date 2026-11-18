import { z } from "zod";

// Plain JS so scripts/refresh-trustpilot.js can run it with node directly.

/** GET /v1/business-units/{id} on Trustpilot's Business Units API. */
const businessUnit = z.object({
  score: z.object({
    trustScore: z.number().min(1).max(5),
    stars: z.number().min(1).max(5),
  }),
  numberOfReviews: z.object({ total: z.number().int().positive() }),
});

/** GET /v1/business-units/{id}/reviews, one page. */
const reviewPage = z.object({
  // An unknown or removed tag answers with an empty list. Fewer than three
  // reviews would leave a hole in the page, so the last good copy stays.
  reviews: z
    .array(
      z.object({
        id: z.string().min(1),
        stars: z.number().int().min(1).max(5),
        createdAt: z.iso.datetime({ offset: true }),
        title: z.string(),
        text: z.string().min(1),
        consumer: z.object({ displayName: z.string().min(1) }),
      }),
    )
    .min(3),
});

/**
 * Turns Trustpilot's API responses into the snapshot the site renders.
 * `reviewUrls` maps a review id to its public page (from the review's
 * web-links). Throws on anything unusable.
 */
export function toTrustpilotSnapshot(raw, fetchedAt) {
  const unit = businessUnit.parse(raw.businessUnit);
  const { reviews } = reviewPage.parse(raw.reviews);
  const reviewUrls = z.record(z.string(), z.url()).parse(raw.reviewUrls);
  return {
    fetchedAt,
    trustScore: unit.score.trustScore,
    stars: unit.score.stars,
    totalReviews: unit.numberOfReviews.total,
    reviews: reviews.map((review) => ({
      name: review.consumer.displayName,
      stars: review.stars,
      date: review.createdAt.slice(0, 10),
      title: review.title,
      text: review.text,
      url: z.url().parse(reviewUrls[review.id]),
    })),
  };
}
