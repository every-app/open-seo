import type { PhrasingContent, RootContent, Table } from "mdast";
// pdfmake's build for browsers, with everything it needs inside it: the one
// for Node reads its data from files, which a Worker doesn't have.
import pdfmake from "pdfmake/build/pdfmake.min.js";
import roboto from "pdfmake/build/vfs_fonts.js";
import type {
  Content,
  CustomTableLayout,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { StoredReport } from "./desk";
import { mayLink, signupUrl } from "./links";

// A written report as a PDF, which is how it reaches whoever asked: the link
// in their email downloads it. A report has no page.
//
// The model that wrote the report read pages anyone could have written, and
// nobody reads the report before it goes out. So this file decides what a
// report may carry, on the parsed Markdown, where a link is known to be a
// link however it was spelled:
//
// - No images at all. Nothing here draws one, and the PDF library is allowed
//   to fetch nothing.
// - A link stays a link only when it goes to the report's own site, a site
//   named on a results page the report checked, or openseo.so. Any other
//   link becomes its own words.
// - PDF readers turn a written-out address into a link by themselves. So an
//   address that isn't one of those links loses its "https://" and "www.",
//   which leaves a name to read and nothing to click.
// - Raw HTML is shown as text.
//
// This narrows what a hostile page can put under our name. It can't stop one
// shaping the words.

const INK = "#111111";
const MUTED = "#66625e";
const ACCENT = "#ff5600";
const RULE = "#d8d1c8";
const SURFACE = "#f5f1ec";
const MARGIN = 54;
/** A US Letter page is 612 points wide. */
const WIDTH = 612 - 2 * MARGIN;

// The typeface is Roboto, which comes with pdfmake.
pdfmake.addVirtualFileSystem(roboto);
pdfmake.setUrlAccessPolicy(() => false);

/** A stretch of text in one style. */
type Run = {
  text: string;
  bold?: boolean;
  italics?: boolean;
  decoration?: "underline" | "lineThrough";
  decorationColor?: string;
  background?: string;
  link?: string;
};

const ADDRESS_START = /\bhttps?:\/\/|\bwww\./gi;

/**
 * Takes the "https://" and "www." off every address that isn't a link of
 * ours, across the runs of one block: an address split between two styles is
 * still one address to a PDF reader.
 */
function unlinked(runs: Run[]): Run[] {
  const text = runs
    .map((run) => (run.link ? " ".repeat(run.text.length) : run.text))
    .join("");
  const cut = new Set<number>();
  for (const match of text.matchAll(ADDRESS_START))
    for (let at = 0; at < match[0].length; at++) cut.add(match.index + at);
  let start = 0;
  return runs.map((run) => {
    const from = start;
    start += run.text.length;
    return {
      ...run,
      text: run.text
        .split("")
        .filter((_, at) => !cut.has(from + at))
        .join(""),
    };
  });
}

const words = (text: string) => unlinked([{ text }]);

const TABLE_LAYOUT: CustomTableLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0,
  hLineColor: () => RULE,
  paddingLeft: () => 4,
  paddingRight: () => 4,
  paddingTop: () => 4,
  paddingBottom: () => 3,
};

/** The report's Markdown as the PDF's content. */
function body(report: StoredReport): Content[] {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(report.markdown);
  /** Where "[words][name]" links go, from the "[name]: address" lines. */
  const definitions = new Map<string, string>();
  const collect = (node: RootContent) => {
    // The first line for a name is the one Markdown uses.
    if (node.type === "definition" && !definitions.has(node.identifier))
      definitions.set(node.identifier, node.url);
    if ("children" in node) node.children.forEach(collect);
  };
  tree.children.forEach(collect);

  const link = (
    address: string | undefined,
    children: PhrasingContent[],
    style: Omit<Run, "text">,
  ): Run[] =>
    mayLink(address, report.site, report.hosts)
      ? inline(children, {
          ...style,
          link: address,
          decoration: "underline",
          decorationColor: ACCENT,
        })
      : inline(children, style);

  const inline = (
    nodes: PhrasingContent[],
    style: Omit<Run, "text"> = {},
  ): Run[] =>
    nodes.flatMap((node): Run[] => {
      switch (node.type) {
        case "text":
          // A line break inside a paragraph's source is a space.
          return [{ ...style, text: node.value.replaceAll("\n", " ") }];
        case "strong":
          return inline(node.children, { ...style, bold: true });
        case "emphasis":
          return inline(node.children, { ...style, italics: true });
        case "delete":
          return inline(node.children, { ...style, decoration: "lineThrough" });
        case "inlineCode":
          return [{ ...style, text: node.value, background: SURFACE }];
        case "html":
          return [{ ...style, text: node.value }];
        case "break":
          return [{ ...style, text: "\n" }];
        case "link":
          return link(node.url, node.children, style);
        case "linkReference":
          return link(definitions.get(node.identifier), node.children, style);
        // Images, and anything else, are left out.
        default:
          return [];
      }
    });

  const text = (nodes: PhrasingContent[]) => unlinked(inline(nodes));

  const table = (node: Table): Content => {
    const columns = Math.max(
      ...node.children.map((row) => row.children.length),
    );
    return {
      style: "table",
      layout: TABLE_LAYOUT,
      table: {
        headerRows: 1,
        keepWithHeaderRows: 1,
        dontBreakRows: true,
        widths: Array.from({ length: columns }, () => "auto"),
        // Every row gets every column: the PDF library refuses a short row.
        body: node.children.map((row, index) =>
          Array.from({ length: columns }, (_, column) => ({
            text: text(row.children[column]?.children ?? []),
            alignment: node.align?.[column] ?? "left",
            ...(index === 0 ? { bold: true, fillColor: SURFACE } : {}),
          })),
        ),
      },
    };
  };

  const blocks = (nodes: RootContent[]): Content[] =>
    nodes.flatMap((node): Content[] => {
      switch (node.type) {
        case "heading":
          // The report's own H1 repeats the title at the top of the page.
          if (node.depth === 1) return [];
          return [
            {
              text: text(node.children),
              style: node.depth === 2 ? "h2" : "h3",
              headlineLevel: 1,
            },
          ];
        case "paragraph":
          return [{ text: text(node.children), style: "paragraph" }];
        case "list": {
          const items = node.children.map((item) => blocks(item.children));
          return [
            node.ordered
              ? { ol: items, start: node.start ?? 1, style: "list" }
              : { ul: items, style: "list" },
          ];
        }
        case "blockquote":
          return [
            {
              stack: blocks(node.children),
              margin: [12, 0, 0, 0],
              color: MUTED,
            },
          ];
        case "code":
          return [
            {
              text: words(node.value),
              style: "paragraph",
              background: SURFACE,
              preserveLeadingSpaces: true,
            },
          ];
        case "html":
          return [{ text: words(node.value), style: "paragraph" }];
        case "table":
          return [table(node)];
        case "thematicBreak":
          return [rule()];
        case "footnoteDefinition":
          return blocks(node.children);
        default:
          return [];
      }
    });

  return blocks(tree.children);
}

const rule = (): Content => ({
  canvas: [
    {
      type: "line",
      x1: 0,
      y1: 0,
      x2: WIDTH,
      y2: 0,
      lineWidth: 0.5,
      lineColor: RULE,
    },
  ],
  margin: [0, 10, 0, 10],
});

/** The headline numbers, three to a row. */
function stats(report: StoredReport): Content[] {
  if (!report.stats.length) return [];
  const cells = report.stats.map((stat) => ({
    stack: [
      { text: words(stat.value), fontSize: 15, bold: true },
      { text: words(stat.label), fontSize: 8, color: MUTED },
    ],
    margin: [0, 0, 8, 6] as [number, number, number, number],
  }));
  const rows = [];
  for (let at = 0; at < cells.length; at += 3)
    rows.push([0, 1, 2].map((column) => cells[at + column] ?? ""));
  return [
    {
      layout: { defaultBorder: false, paddingLeft: () => 0 },
      table: { widths: ["*", "*", "*"], body: rows },
      margin: [0, 14, 0, 0],
    },
  ];
}

function document(report: StoredReport): TDocumentDefinitions {
  const written = new Date(report.writtenAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  return {
    pageSize: "LETTER",
    pageMargins: [MARGIN, MARGIN, MARGIN, 60],
    language: "en-US",
    info: {
      title: report.title,
      author: "OpenSEO",
      subject: `SEO report for ${report.site}`,
    },
    defaultStyle: {
      font: "Roboto",
      fontSize: 10,
      lineHeight: 1.35,
      color: INK,
    },
    styles: {
      h2: { fontSize: 15, bold: true, margin: [0, 18, 0, 6] },
      h3: { fontSize: 11.5, bold: true, margin: [0, 12, 0, 4] },
      paragraph: { margin: [0, 0, 0, 8] },
      list: { margin: [0, 0, 0, 8] },
      table: { fontSize: 8, lineHeight: 1.25, margin: [0, 4, 0, 12] },
    },
    // A heading is never the last thing on a page.
    pageBreakBefore: (node, { getFollowingNodesOnPage }) =>
      node.headlineLevel === 1 && getFollowingNodesOnPage().length === 0,
    footer: (page, pages) => ({
      margin: [MARGIN, 24, MARGIN, 0],
      fontSize: 8,
      color: MUTED,
      columns: [
        { text: `SEO report for ${report.site}, by OpenSEO` },
        { text: `Page ${page} of ${pages}`, alignment: "right" },
      ],
    }),
    content: [
      {
        columns: [
          {
            text: "OpenSEO",
            link: "https://openseo.so/",
            fontSize: 15,
            bold: true,
            characterSpacing: -0.6,
          },
          {
            text: "SEO report",
            alignment: "right",
            fontSize: 9,
            bold: true,
            color: ACCENT,
            margin: [0, 5, 0, 0],
          },
        ],
      },
      {
        text: words(report.title),
        fontSize: 24,
        bold: true,
        lineHeight: 1.15,
        margin: [0, 22, 0, 8],
      },
      { text: words(report.headline), fontSize: 12, color: MUTED },
      ...stats(report),
      {
        text: `Written automatically on ${written} from ${report.site}'s public pages and search data. Nobody at OpenSEO has read it. Every number is an estimate.`,
        fontSize: 8.5,
        color: MUTED,
        margin: [0, 14, 0, 0],
      },
      rule(),
      ...(report.takeaways.length
        ? [
            {
              ul: report.takeaways.map((takeaway) => ({
                text: words(takeaway),
                margin: [0, 0, 0, 4] as [number, number, number, number],
              })),
              margin: [0, 2, 0, 0] as [number, number, number, number],
            },
          ]
        : []),
      ...body(report),
      {
        unbreakable: true,
        margin: [0, 18, 0, 0],
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => RULE,
          vLineColor: () => RULE,
          paddingLeft: () => 16,
          paddingRight: () => 16,
          paddingTop: () => 14,
          paddingBottom: () => 14,
        },
        table: {
          widths: ["*"],
          body: [
            [
              {
                fillColor: SURFACE,
                stack: [
                  {
                    text: "Track these keywords in OpenSEO",
                    fontSize: 14,
                    bold: true,
                  },
                  {
                    text: `Create an account and ${report.site} is already filled in. Start with free trial credits.`,
                    color: MUTED,
                    margin: [0, 4, 0, 8],
                  },
                  {
                    layout: {
                      defaultBorder: false,
                      paddingLeft: () => 12,
                      paddingRight: () => 12,
                      paddingTop: () => 6,
                      paddingBottom: () => 5,
                    },
                    table: {
                      body: [
                        [
                          {
                            text: "Create an account",
                            link: signupUrl(report.site, "report-pdf"),
                            bold: true,
                            color: "#ffffff",
                            fillColor: INK,
                          },
                        ],
                      ],
                    },
                  },
                ],
              },
            ],
          ],
        },
      },
    ],
  };
}

export async function reportPdf(report: StoredReport): Promise<Blob> {
  return pdfmake.createPdf(document(report)).getBlob();
}
