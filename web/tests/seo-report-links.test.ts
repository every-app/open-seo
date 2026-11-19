import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ReportMarkdown } from "../src/components/report-markdown";

// What a report's page shows of what the model wrote. The page being
// reported on shapes that text, so nothing in it may load an image or link
// anywhere but the report's own site, a site from its search results, and
// OpenSEO.

const render = (markdown: string) =>
  renderToStaticMarkup(
    createElement(ReportMarkdown, {
      markdown,
      site: "example.com",
      hosts: ["rival.example"],
    }),
  );

it.each([
  ["an image", "![chart](https://evil.example/pixel.png)"],
  [
    "an image by reference",
    "![chart][pixel]\n\n[pixel]: https://evil.example/pixel.png",
  ],
  ["a link", "[Sign in to see the full report](https://evil.example/login)"],
  [
    "a link with brackets in its words",
    "[see [this] page](https://evil.example/)",
  ],
  ["a link with an escaped bracket", "[a\\]b](https://evil.example/)"],
  [
    "a link whose words break over two lines",
    "[sign\nin](https://evil.example/)",
  ],
  ["a link by reference", "[sign in][there]\n\n[there]: https://evil.example/"],
  ["an address in angle brackets", "<https://evil.example/>"],
  ["a bare address", "Visit https://evil.example/ or www.evil.example today."],
  ["a script address", "[run](javascript:alert(1))"],
  ["a look-alike of the site", "[home](https://example.com.evil.example/)"],
  ["an address with credentials", "[home](https://example.com@evil.example/)"],
  [
    "raw HTML",
    '<a href="https://evil.example/">sign in</a><img src="https://evil.example/pixel.png">',
  ],
])("shows %s as words, with nothing to load or follow", (_, markdown) => {
  const page = render(markdown);
  expect(page).not.toMatch(/<(a|img)\b/);
});

it("keeps links to the site, its search results and OpenSEO, marked as not ours", () => {
  const page = render(
    "[pricing](https://www.example.com/pricing), [a rival](https://rival.example/x), [OpenSEO](https://openseo.so/) and [Method](#method).",
  );
  expect(page.match(/<a /g)).toHaveLength(4);
  expect(page).toContain(
    '<a href="https://www.example.com/pricing" rel="nofollow ugc noopener noreferrer" target="_blank">pricing</a>',
  );
  expect(page.match(/rel="nofollow ugc noopener noreferrer"/g)).toHaveLength(4);
});
