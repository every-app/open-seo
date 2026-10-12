import type { Fixture } from "./types";
import { htmlResponse, renderPage } from "../lib";

const KITCHEN_SINK_TITLE =
  "The Kitchen Sink Page That Breaks Six SEO Rules At Once And Has A Title That Is Far Too Long";

// A single page that trips several checks at once. Deliberately NOT thin (it
// has plenty of text) and NOT noindex, so it reads as a page that wants to rank
// and gets in its own way six different ways.
const kitchenSink: Fixture = {
  path: "/kitchen-sink",
  category: "Kitchen sink",
  name: "Kitchen sink (everything at once)",
  summary:
    "A title that is too long, no meta description, two H1s, a skipped heading level, an image with no alt, and a slow response.",
  lesson:
    "Real broken pages usually have more than one problem. An audit should report every one of these, not stop at the first.",
  expectedIssues: [
    "title-too-long",
    "missing-meta-description",
    "multiple-h1",
    "heading-order-skip",
    "images-missing-alt",
    "slow-response",
  ],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: kitchenSink,
        title: KITCHEN_SINK_TITLE,
        // meta description intentionally omitted
        bodyHtml: `<h1>The kitchen sink page</h1>
<h1>Yes, that was two H1s</h1>
<p class="lede">This page is broken on purpose, in more than one way, so an audit has plenty to find.</p>
<img src="/img/placeholder.svg" width="720" height="360">
<h4>This section skips straight to an H4</h4>
<p>Everything on this page is wrong on purpose, and it is wrong in more than one way at the same time. That is how broken pages usually show up. Nobody ships a page with a single, tidy problem. They ship a template that is a little off in a few places, and each small problem chips away at how the page does in search.</p>
<p>Here they are. The title runs well past 60 characters, so search results cut it off. There is no meta description, so the search engine writes a snippet from whatever text it finds. Two lines are marked as H1, so the page makes two claims about its own topic. The outline then jumps from H1 to H4, skipping two levels.</p>
<h4>And a few more</h4>
<p>The image a few paragraphs up has no alt attribute, so it is invisible to a screen reader and to image search. And the whole response is slow, waiting well over a second and a half before the first byte. Any one of these is worth fixing on its own. Together they are a checklist of the most common on-page problems, put on one URL so you can watch an audit find all of them instead of stopping after the first.</p>
<p>If an audit reports all six problems for this page, it is working. If it only finds one or two, it is giving people false confidence, which is worse than no audit at all, because real problems hide behind a clean-looking report.</p>`,
      }),
      { delayMs: 1700 },
    ),
};

export const kitchenSinkFixtures: Fixture[] = [kitchenSink];
