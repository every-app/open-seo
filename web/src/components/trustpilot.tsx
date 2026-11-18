/**
 * Our Trustpilot rating and selected reviews, rendered as plain HTML from
 * src/data/trustpilot.json (refreshed from Trustpilot's API by
 * scripts/refresh-trustpilot.js). None of Trustpilot's scripts load on the
 * page.
 *
 * Until the first refresh the file holds no reviews and nothing here renders.
 * Review text is shown exactly as written; long reviews are clipped by CSS and
 * link to the full review.
 */

import { useRef } from "react";
import data from "@/data/trustpilot.json";
import "./trustpilot.css";

const snapshot: {
  trustScore: number;
  stars: number;
  totalReviews: number;
  reviews: {
    name: string;
    stars: number;
    date: string;
    title: string;
    text: string;
    url: string;
  }[];
} = data;

const PROFILE_URL = "https://www.trustpilot.com/review/openseo.so";

export const hasTrustpilotReviews = snapshot.reviews.length > 0;

const STAR_PATH =
  "M12 1.6l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.7l-6.4 3.5L7 14.1l-5.3-5 7.2-.9z";

/** Five stars with the first `value` filled; halves are drawn as halves. */
function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span
      className="tp-stars"
      role="img"
      aria-label={`${value} out of 5 stars`}
      style={{ width: size * 5, height: size }}
    >
      <svg viewBox="0 0 120 24" width={size * 5} height={size} aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={STAR_PATH} transform={`translate(${i * 24})`} />
        ))}
      </svg>
      <svg
        viewBox="0 0 120 24"
        width={size * 5}
        height={size}
        aria-hidden
        className="tp-stars-fill"
        style={{ clipPath: `inset(0 ${100 - (value / 5) * 100}% 0 0)` }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={STAR_PATH} transform={`translate(${i * 24})`} />
        ))}
      </svg>
    </span>
  );
}

/** One quiet line: stars, TrustScore, review count, link to the profile. */
export function TrustpilotRating({ className = "" }: { className?: string }) {
  if (!hasTrustpilotReviews) return null;
  return (
    <a
      href={PROFILE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`tp-rating ${className}`}
    >
      <Stars value={snapshot.stars} />
      <span>
        <strong>{snapshot.trustScore.toFixed(1)}</strong> TrustScore ·{" "}
        {snapshot.totalReviews} reviews on{" "}
        <span className="tp-wordmark">
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
            <path d={STAR_PATH} />
          </svg>
          Trustpilot
        </span>
      </span>
    </a>
  );
}

const reviewDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

type Layout = "carousel" | "grid";

/**
 * The selected reviews as cards.
 * - carousel: one swipeable row with previous/next buttons.
 * - grid: even rows of three, long reviews clipped.
 */
export function TrustpilotReviews({
  layout,
  limit = snapshot.reviews.length,
}: {
  layout: Layout;
  limit?: number;
}) {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (direction: 1 | -1) =>
    track.current?.scrollBy({
      left: direction * track.current.clientWidth * 0.8,
      behavior: "smooth",
    });

  return (
    <div className={`tp-reviews tp-reviews-${layout}`}>
      <div ref={track} className="tp-track">
        {snapshot.reviews.slice(0, limit).map((review) => (
          <figure className="tp-card" key={review.url}>
            <Stars value={review.stars} size={15} />
            <blockquote>
              <strong className="tp-card-title">{review.title}</strong>
              {/* Blank lines between paragraphs would eat the clipped height. */}
              <span className="tp-card-text">
                {review.text.replace(/\n\s*\n/g, "\n")}
              </span>
            </blockquote>
            <figcaption>
              <span className="tp-card-name">{review.name}</span>
              <a href={review.url} target="_blank" rel="noopener noreferrer">
                <time dateTime={review.date}>
                  {reviewDate.format(new Date(review.date))}
                </time>{" "}
                · Read on Trustpilot
              </a>
            </figcaption>
          </figure>
        ))}
      </div>
      {layout === "carousel" ? (
        <div className="tp-nav">
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label="Previous reviews"
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label="More reviews"
          >
            →
          </button>
        </div>
      ) : null}
    </div>
  );
}
