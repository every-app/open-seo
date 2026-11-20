import { expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ DurableObject: class {} }));
import { reportPdf } from "../src/lib/seo-report/pdf";
import { report } from "./seo-report-support";

// What a report's PDF carries of what the model wrote. The site being
// reported on shapes that text, so nothing in it may be an image or a link to
// anywhere but the report's own site, a site from its search results, and
// OpenSEO.

/** The links we put in every report: the wordmark and the account button. */
const OURS = [
  "https://openseo.so/",
  "https://app.openseo.so/sign-up?domain=example.com&utm_source=seo-report&utm_medium=email&utm_content=report-pdf",
];

/** The PDF of a report with this Markdown: every address it links to, and whether it holds an image. */
async function pdfOf(markdown: string) {
  const file = await reportPdf({
    ...report("example.com"),
    markdown,
    hosts: ["rival.example"],
  });
  const pdf = Buffer.from(await file.arrayBuffer()).toString("latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  return {
    links: new Set([...pdf.matchAll(/\/URI \((.*?)\)/g)].map(([, to]) => to)),
    image: pdf.includes("/Subtype /Image"),
  };
}

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
  ["a link in a table", "| a |\n|---|\n| [in](https://evil.example/) |"],
  ["a script address", "[run](javascript:alert(1))"],
  ["a look-alike of the site", "[home](https://example.com.evil.example/)"],
  ["an address with credentials", "[home](https://example.com@evil.example/)"],
  [
    "raw HTML",
    '<a href="https://evil.example/">sign in</a><img src="https://evil.example/pixel.png">',
  ],
])("makes %s words, with nothing to load or follow", async (_, markdown) => {
  expect(await pdfOf(markdown)).toEqual({ links: new Set(OURS), image: false });
});

it("keeps links to the site, its search results and OpenSEO", async () => {
  const { links } = await pdfOf(
    "[pricing](https://www.example.com/pricing), [a rival](https://rival.example/x), [OpenSEO](https://openseo.so/pricing) and [by reference][own].\n\n[own]: https://example.com/about",
  );
  expect(links).toEqual(
    new Set([
      ...OURS,
      "https://www.example.com/pricing",
      "https://rival.example/x",
      "https://openseo.so/pricing",
      "https://example.com/about",
    ]),
  );
});

it("makes a PDF of a table whose rows are shorter than its heading", async () => {
  await pdfOf("| a | b | c |\n|---|---|---|\n| only one |\n| two | cells |");
});

it("keeps the link to create an account after a section too long for one page", async () => {
  const bullets = Array.from({ length: 150 }, (_, at) => `- finding ${at}`);
  const { links } = await pdfOf(`## Findings\n\n${bullets.join("\n")}`);
  expect(links).toEqual(new Set(OURS));
});
