import type { Fixture } from "./types";
import { htmlResponse, renderPage } from "../lib";
import { article, lorem } from "./helpers";

const CAT = "Head tags & headings";

// 1 — no <title> element at all -------------------------------------------
const missingTitle: Fixture = {
  path: "/head/missing-title",
  category: CAT,
  name: "Missing <title> tag",
  summary: "This page has no <title> element at all.",
  lesson:
    "The title is the strongest signal of what a page is about, and it is the headline shown in search results. If there is none, the search engine writes one for you.",
  expectedIssues: ["missing-title"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: missingTitle,
        // title intentionally omitted
        metaDescription:
          "This page is fine except for one thing: it has no title tag for search results or browser tabs.",
        bodyHtml: article({
          h1: "A page with no title",
          lede: "The content and headings here are fine. There is just no title tag in the head.",
          sections: [
            {
              h2: "What the title does",
              body: "The title tag is how a page introduces itself to a search engine and to anyone scanning a list of results. It carries the main topic and it is the first thing people read. When it is missing, the search engine builds its own title from text on the page, and that is usually worse than one you would write yourself.",
            },
            {
              h2: "Why it goes missing",
              body: "A missing title almost always comes from a template. A content type never got a title field, or a component only renders the title when a value is passed in, or a migration dropped the head tags. The page looks fine to a person, so the problem is easy to miss until you check the head.",
            },
          ],
        }),
      }),
    ),
};

// 2 — title longer than ~60 chars -----------------------------------------
const longTitle =
  "The Complete And Fully Unabridged Guide To Writing Page Titles That Are Much Too Long To Fit In Search Results";
const titleTooLong: Fixture = {
  path: "/head/title-too-long",
  category: CAT,
  name: "Title too long",
  summary: `The title is ${longTitle.length} characters. Search results cut off around 60.`,
  lesson:
    "Past about 60 characters, the title gets cut off with an ellipsis, often mid-word. Put the important words first.",
  expectedIssues: ["title-too-long"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: titleTooLong,
        title: longTitle,
        metaDescription:
          "The title on this page runs well past the length a search result will show.",
        bodyHtml: article({
          h1: "A title that runs too long",
          lede: "There is a length past which a title stops helping and just gets cut off.",
          sections: [
            {
              h2: "Where the title gets cut",
              body: "Search engines show the title in a fixed width, which works out to roughly 60 characters for most English text. Anything past that is replaced with an ellipsis. If the useful, specific words are at the end, people never see them. They see a sentence that trails off and they move on to the next result.",
            },
            {
              h2: "How to shorten it",
              body: "Lead with the main topic. Drop filler like complete guide to and ultimate. Move the brand name to the end, where a cut hurts least. A tight title of about 50 characters usually does better than a long one, both for clicks and for how clearly a search engine can tell what the page is about.",
            },
          ],
        }),
      }),
    ),
};

// 3 — title shorter than ~10 chars ----------------------------------------
const titleTooShort: Fixture = {
  path: "/head/title-too-short",
  category: CAT,
  name: "Title too short",
  summary: 'The title is just "Hi", which describes nothing.',
  lesson:
    "A one-word title wastes the most useful text you control. It cannot hold a topic or give anyone a reason to click.",
  expectedIssues: ["title-too-short"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: titleTooShort,
        title: "Hi",
        metaDescription:
          "The title on this page is a single short word, which tells a search engine almost nothing.",
        bodyHtml: article({
          h1: "A title that is too short",
          lede: "Short is good. This is too short to say anything.",
          sections: [
            {
              h2: "Titles need room to work",
              body: "The title is the most useful string of text you control on a page. A two-character title throws that away. It cannot hold the term people search for, it does not describe the page, and it gives nobody a reason to pick this result over the others next to it.",
            },
            {
              h2: "A good length",
              body: "Aim for about 30 to 60 characters. That is enough to name the topic, include the words people actually search for, and add a short hook. In practice that is one clear phrase, not a single word and not a full sentence that runs off the end.",
            },
          ],
        }),
      }),
    ),
};

// 4 — no meta description --------------------------------------------------
const missingMeta: Fixture = {
  path: "/head/missing-meta-description",
  category: CAT,
  name: "Missing meta description",
  summary: 'There is no <meta name="description"> on the page.',
  lesson:
    "With no description, the search engine pulls some text from the page for the snippet. Sometimes that is fine, and sometimes it is a nav label.",
  expectedIssues: ["missing-meta-description"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: missingMeta,
        title: "A page with no meta description",
        // metaDescription intentionally omitted
        bodyHtml: article({
          h1: "No meta description",
          lede: "This page has a title and clean headings. It has no meta description.",
          sections: [
            {
              h2: "What the description does",
              body: "The meta description is the line of text under the title in search results. It does not affect ranking directly, but a good one lifts the click rate. Leave it out and the search engine writes one for you from text on the page, which may or may not read well.",
            },
            {
              h2: "How to write one",
              body: "Treat it as a short ad. In about 70 to 160 characters, say what the page gives you and give a reason to click. Write a different one for each page so results never show the same snippet twice, and do not stuff it with keywords, which search engines tend to ignore.",
            },
          ],
        }),
      }),
    ),
};

// 5 — meta description longer than ~160 chars -----------------------------
const longMeta =
  "This meta description keeps going well past the point where a search engine would ever show the whole thing, adding clause after clause after clause, so most of it ends up cut off with an ellipsis that no one reads.";
const metaTooLong: Fixture = {
  path: "/head/meta-description-too-long",
  category: CAT,
  name: "Meta description too long",
  summary: `The meta description is ${longMeta.length} characters. It gets cut off around 160.`,
  lesson:
    "Search engines cut the description off near 160 characters. Anything after that is text no one will read.",
  expectedIssues: ["meta-description-too-long"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: metaTooLong,
        title: "A page with a very long meta description",
        metaDescription: longMeta,
        bodyHtml: article({
          h1: "A meta description that runs too long",
          lede: "You can write too much here, and this page proves it.",
          sections: [
            {
              h2: "Where the snippet gets cut",
              body: "The description is shown in a fixed width and cut off with an ellipsis, usually somewhere around 150 to 160 characters. Everything past that point does not appear in the result. If your reason to click is at the end of a long description, it will not be seen.",
            },
            {
              h2: "Keep it to one line",
              body: "Put the most important point first, keep the whole thing to a single sentence, and stop before the cutoff. If you find yourself joining three ideas together with semicolons, that is two descriptions competing for one slot.",
            },
          ],
        }),
      }),
    ),
};

// 6 — meta description shorter than ~70 chars -----------------------------
const shortMeta = "A short, unique snippet for this one fixture.";
const metaTooShort: Fixture = {
  path: "/head/meta-description-too-short",
  category: CAT,
  name: "Meta description too short",
  summary: `The meta description is only ${shortMeta.length} characters.`,
  lesson:
    "A very short description wastes the space search results give you. Give the page a real summary and a reason to click.",
  expectedIssues: ["meta-description-too-short"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: metaTooShort,
        title: "A page with a very short meta description",
        metaDescription: shortMeta,
        bodyHtml: article({
          h1: "A meta description that is too short",
          lede: "The page has a description, but it is too short to do much work.",
          sections: [
            {
              h2: "Why short snippets underperform",
              body: "The meta description is the short sales pitch under the title in a search result. A tiny description leaves most of that space blank, so the page says less than the results around it. Search engines may also decide the tag is not useful and pull text from the page instead, which can produce a choppy or irrelevant snippet.",
            },
            {
              h2: "What enough detail looks like",
              body: "A useful description names the page, explains what someone will get, and gives a reason to click. It does not need to be long, but it needs enough room to be specific. Around 70 to 160 characters is usually enough to summarize the page without drifting into a paragraph.",
            },
          ],
        }),
      }),
    ),
};

// 7 — no <h1> --------------------------------------------------------------
const missingH1: Fixture = {
  path: "/head/missing-h1",
  category: CAT,
  name: "Missing H1",
  summary: "The page starts at <h2>. There is no H1 anywhere.",
  lesson:
    "The H1 is the on-page headline that states the main topic. A page without one has no clear anchor for the subject.",
  expectedIssues: ["missing-h1"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: missingH1,
        title: "A page with no H1",
        metaDescription:
          "Every heading on this page is an H2 or lower. The top-level H1 that should state the topic is missing.",
        // Hand-authored body: starts at H2 on purpose, no H1.
        bodyHtml: `<h2>Where the headline should be</h2>
<p class="lede">This article has plenty to say, but it never states its topic in an H1.</p>
<p>A well-structured page opens with a single H1 that names what the page is about, then uses H2s and H3s for the sections under it. When the H1 is missing, both a screen reader and a search crawler lose the anchor that tells them the main subject, and the page reads like a chapter with no chapter title.</p>
<h2>Why it happens</h2>
<p>Usually a design system styles the real headline as a plain div for exact control, or a template marks the site logo as the only H1 and leaves the article headline as an H2. Either way the fix is the same: make the real headline a proper H1 so the markup matches what the eye already sees.</p>
<h3>A quick check</h3>
<p>Open the page and confirm there is exactly one H1, and that a stranger could read it and know what the page is about before scrolling.</p>`,
      }),
    ),
};

// 8 — empty <h1> -----------------------------------------------------------
const emptyH1: Fixture = {
  path: "/head/empty-h1",
  category: CAT,
  name: "Empty H1",
  summary: "The only H1 exists in the markup, but it has no text.",
  lesson:
    "An empty H1 is the same as no H1 for users and crawlers. The tag exists, but the page still never states its main topic.",
  expectedIssues: ["missing-h1"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: emptyH1,
        title: "A page with an empty H1",
        metaDescription:
          "The only H1 on this page is empty, so the markup has a top-level heading tag but no actual heading text.",
        bodyHtml: `<h1></h1>
<p class="lede">The headline tag is present, but it does not contain a headline.</p>
<p>${lorem(90)}</p>
<h2>Why an empty heading fails</h2>
<p>An H1 is useful because it says what the page is about. A blank tag gives screen readers a heading stop with no label and gives search engines no phrase to connect to the topic. It can happen when a template renders the heading wrapper even when the CMS field is blank, or when styling hides all text from the tag.</p>
<h3>What to fix</h3>
<p>Put the real page headline inside the H1, then use H2 and H3 for the sections below it. If the page does not have a clear headline yet, write one before publishing instead of leaving an empty element in the document outline.</p>`,
      }),
    ),
};

// 9 — multiple <h1> --------------------------------------------------------
const multipleH1: Fixture = {
  path: "/head/multiple-h1",
  category: CAT,
  name: "Multiple H1s",
  summary: "The page marks three separate lines as an H1.",
  lesson:
    "More than one H1 splits the main-topic signal, and it usually means a template is applying H1 to things that are not headlines.",
  expectedIssues: ["multiple-h1"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: multipleH1,
        title: "A page with three H1s",
        metaDescription:
          "This page marks three separate lines as an H1, so a crawler gets three competing claims about the topic.",
        bodyHtml: `<h1>This line is an H1</h1>
<h1>So is this one</h1>
<p class="lede">Three H1s on one page. A crawler cannot tell which one is the actual topic.</p>
<p>An H1 is meant to be the single most important label on a page, the headline. When a template makes the logo, the headline, and a sidebar title all H1s, a crawler gets three claims about what the page is about and has to guess. The topic signal you meant to send gets split three ways.</p>
<h1>And this is the third H1</h1>
<p>The usual cause is a shared heading component with a fixed level, dropped into places that should have been H2 or H3. Pick the one real headline, keep it as the H1, and lower the rest. Something like a logo should not be a heading at all; a styled span or div is the right tag for that.</p>`,
      }),
    ),
};

// 10 — heading levels skip (h1 -> h4) -------------------------------------
const headingSkip: Fixture = {
  path: "/head/heading-order-skip",
  category: CAT,
  name: "Heading levels skip",
  summary: "The headings jump from <h1> to <h4>, skipping H2 and H3.",
  lesson:
    "Skipping heading levels breaks the outline that screen readers and parsers rely on. Go down one level at a time.",
  expectedIssues: ["heading-order-skip"],
  handler: () =>
    htmlResponse(
      renderPage({
        fixture: headingSkip,
        title: "A page that skips heading levels",
        metaDescription:
          "The headings on this page jump from H1 to H4, leaving a gap that confuses screen readers and parsers.",
        bodyHtml: `<h1>Headings that skip a level</h1>
<p class="lede">This page goes from an H1 straight to an H4, as if H2 and H3 did not exist.</p>
<h4>The first section, which should have been an H2</h4>
<p>Headings are not just larger and smaller text. They form a nested outline that screen readers announce and that search engines use to understand structure. When the page jumps from H1 to H4, a screen reader user hears that they have gone three levels deep with nothing in between, which is confusing and makes the page harder to move through by headings.</p>
<h4>Another skipped-level section</h4>
<p>The fix is about the tag, not the size. If you want smaller text, use CSS, but keep the heading one level below its parent. A clean outline goes H1, then H2, then H3, then H4, so anyone reading the structure can follow it without a missing rung.</p>`,
      }),
    ),
};

export const headTagFixtures: Fixture[] = [
  missingTitle,
  titleTooLong,
  titleTooShort,
  missingMeta,
  metaTooLong,
  metaTooShort,
  missingH1,
  emptyH1,
  multipleH1,
  headingSkip,
];
