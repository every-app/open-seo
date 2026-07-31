import { describe, expect, it } from "vitest";
import { isFollowingBottom } from "@/client/hooks/useStickToBottom";

const viewport = (scrollTop: number) => ({
  scrollHeight: 1000,
  clientHeight: 400,
  scrollTop,
});

describe("isFollowingBottom", () => {
  it("follows when pinned to the bottom", () => {
    expect(isFollowingBottom(viewport(600))).toBe(true);
  });

  it("still follows within the threshold", () => {
    // A streaming reply can grow a few pixels between the scroll event and the
    // next render, so being just short of the bottom still counts.
    expect(isFollowingBottom(viewport(560))).toBe(true);
  });

  it("stops following once the reader scrolls away", () => {
    expect(isFollowingBottom(viewport(200))).toBe(false);
  });

  it("stops following one pixel past the threshold", () => {
    // Bottom sits at scrollTop 600, so the default 48px threshold ends at 552.
    expect(isFollowingBottom(viewport(552))).toBe(true);
    expect(isFollowingBottom(viewport(551))).toBe(false);
  });

  it("honours a custom threshold", () => {
    expect(isFollowingBottom(viewport(551), 100)).toBe(true);
    expect(isFollowingBottom(viewport(551), 10)).toBe(false);
  });

  it("treats overscroll as following", () => {
    // Elastic scrolling can push scrollTop past the resting bottom.
    expect(isFollowingBottom(viewport(620))).toBe(true);
  });
});
