import type { PhrasingContent, RootContent, Table } from "mdast";
// pdfmake's build for browsers, with everything it needs inside it: the one
// for Node reads its data from files, which a Worker doesn't have.
import pdfmake from "pdfmake/build/pdfmake.min.js";
import roboto from "pdfmake/build/vfs_fonts.js";
import type {
  Content,
  ContentTable,
  CustomTableLayout,
  Style,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import type { StoredReport } from "./desk";
import { mayLink, signupUrl } from "./links";
import type { Move } from "./plan";

// A written report as a PDF, which is how it reaches whoever asked: the link
// in their email opens it. A report has no page.
//
// The first page is the plan: the verdict in the largest type, then a card
// for each move with its number beside it. The report's Markdown follows as
// the data behind the plan.
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
/**
 * What a part of the report is marked as, so its place can be read back once
 * the pages are laid out: a heading is never left last on a page, the plan's
 * last card should be on the first page, and where the closing box starts
 * says how full the last page is.
 */
enum Mark {
  Heading = 1,
  PlanEnd = 2,
  Closing = 3,
}
/** A last page whose closing box starts above this share of the page is mostly blank. */
const SPARSE_PAGE = 0.3;
/** A table cell this short is a number or a word, and its column is as wide as it. */
const SHORT_CELL = 14;
/**
 * A paragraph or a list item up to this many characters of Markdown is kept
 * on one page, and so is a last section up to LAST_SECTION. Anything longer
 * may be split: the PDF library drops whatever doesn't fit on a page from a
 * block it was told not to split.
 */
const KEEP_WHOLE = 800;
const LAST_SECTION = 1500;

/**
 * How closely a report is set. One whose plan runs past the first page, or
 * that ends on a mostly blank page, is set tighter when that fixes it.
 */
const NORMAL = { font: 10, leading: 1.3, card: 9, cardLeading: 1.18, gap: 1 };
const TIGHT = {
  font: 9.3,
  leading: 1.22,
  card: 8.5,
  cardLeading: 1.1,
  gap: 0.7,
};
type Density = typeof NORMAL;

// The typeface is Roboto, which comes with pdfmake.
pdfmake.addVirtualFileSystem(roboto);
pdfmake.setUrlAccessPolicy(() => false);

// Roboto joins "fi" and "fl" into one shape, which the PDF library then
// leaves out of the text a reader copies or searches. The typeface reads
// this as "ligatures off"; pdfmake's types only know the list that adds.
const NO_LIGATURES = { liga: false } as unknown as Style["fontFeatures"];

/** 880, 1,900, 24.6K: at most five characters, so a move's number never wraps. */
const COUNT = new Intl.NumberFormat("en-US");
const LARGE_COUNT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const count = (value: number) =>
  (value < 10_000 ? COUNT : LARGE_COUNT).format(value);

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

/**
 * The report's Markdown as the PDF's content. Its last section, when short,
 * comes back apart from the rest, to be kept with the closing box.
 */
function body(report: StoredReport): {
  data: Content[];
  lastSection: Content[];
} {
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

  /** How many characters of Markdown these blocks are. */
  const length = (nodes: RootContent[]) =>
    (nodes.at(-1)?.position?.end.offset ?? Infinity) -
    (nodes[0]?.position?.start.offset ?? 0);

  const table = (node: Table): Content => {
    const columns = Math.max(
      ...node.children.map((row) => row.children.length),
    );
    // Every row gets every column: the PDF library refuses a short row.
    const rows = node.children.map((row) =>
      Array.from({ length: columns }, (_, column) =>
        text(row.children[column]?.children ?? []),
      ),
    );
    const length = (runs: Run[]) =>
      runs.reduce((sum, run) => sum + run.text.length, 0);
    // A column of numbers is as wide as its longest; the rest share the page.
    const short = Array.from({ length: columns }, (_, column) =>
      rows.slice(1).every((row) => length(row[column]) <= SHORT_CELL),
    );
    return {
      style: "table",
      layout: TABLE_LAYOUT,
      table: {
        headerRows: 1,
        keepWithHeaderRows: 1,
        dontBreakRows: true,
        widths: short.map((is) => (is ? "auto" : "*")),
        body: rows.map((row, index) =>
          row.map((cell, column) => ({
            text: cell,
            alignment: node.align?.[column] ?? "left",
            noWrap: index > 0 && short[column],
            ...(index === 0 ? { bold: true, color: MUTED } : {}),
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
              headlineLevel: Mark.Heading,
            },
          ];
        case "paragraph":
          return [
            {
              text: text(node.children),
              style: "paragraph",
              unbreakable: length([node]) <= KEEP_WHOLE,
            },
          ];
        case "list": {
          // An item, with whatever is nested under it, stays on one page.
          const items = node.children.map((item) => ({
            stack: blocks(item.children),
            unbreakable: length([item]) <= KEEP_WHOLE,
          }));
          return [
            node.ordered
              ? { ol: items, start: node.start ?? 1, style: "list" }
              : { ul: items, style: "list", markerColor: ACCENT },
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
          return [{ stack: [rule()], margin: [0, 8, 0, 8] }];
        case "footnoteDefinition":
          return blocks(node.children);
        default:
          return [];
      }
    });

  // The last section is the last heading and what follows it. A table can
  // run to any length, so a section holding one stays where it is.
  const from = tree.children
    .map((node) => node.type === "heading" && node.depth > 1)
    .lastIndexOf(true);
  const last = from < 0 ? [] : tree.children.slice(from);
  const cut =
    last.length &&
    length(last) <= LAST_SECTION &&
    !last.some((node) => node.type === "table")
      ? from
      : tree.children.length;
  return {
    data: blocks(tree.children.slice(0, cut)),
    lastSection: blocks(tree.children.slice(cut)),
  };
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
});

/**
 * Steps are drawn down a rail: each one's number in a circle, and a line
 * through the circles from the first to the last.
 */
const RAIL = {
  radius: 4.5,
  /** How far below the top of a line of text its circle starts, so the two share a middle. */
  drop: 1,
  line: 1,
  /** From the circle to the words. */
  gap: 7,
  /** From one step to the next, which is the length of line that shows between two circles. */
  between: 4,
};

/**
 * Steps to follow, in order, one to a row. Each row's circle starts where
 * the row does, so the line (the filled middle column of every row but the
 * last) runs from under the first circle to the top of the last.
 */
function steps(items: string[]): Content {
  const half = RAIL.radius - RAIL.line / 2;
  return {
    margin: [0, RAIL.drop, 0, 0],
    layout: {
      // No room kept for borders: the line has to meet the circles exactly.
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: (column) => (column === 3 ? RAIL.gap : 0),
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: (row, node) =>
        row === node.table.body.length - 1 ? 0 : RAIL.between,
    },
    table: {
      widths: [half, RAIL.line, half, "*"],
      body: items.map((item, index) => [
        {
          stack: [
            {
              canvas: [
                {
                  type: "ellipse",
                  x: RAIL.radius,
                  y: RAIL.radius,
                  r1: RAIL.radius - 0.4,
                  r2: RAIL.radius - 0.4,
                  color: "#ffffff",
                  lineColor: INK,
                  lineWidth: 0.8,
                },
              ],
            },
            {
              text: String(index + 1),
              fontSize: 6,
              bold: true,
              lineHeight: 1,
              alignment: "center",
              // Over the circle, which is wider than the cell it starts in.
              relativePosition: {
                x: RAIL.radius - half / 2,
                y: -RAIL.radius - 3.5,
              },
            },
          ],
        },
        {
          canvas: [],
          fillColor: index < items.length - 1 ? MUTED : undefined,
        },
        { canvas: [] },
        { text: words(item), margin: [0, -RAIL.drop, 0, 0] },
      ]),
    },
  };
}

/** The left column of a move's card: its numbers. */
const NUMBER_COLUMN = 76;
const BAR = 64;

/**
 * One move, never split between pages. Its searches and its difficulty sit
 * together on the left, so the order of the cards explains itself to someone
 * reading only the numbers. Beside them, in the order a reader needs them:
 * what to do, for which keyword on which page, why, the steps, and last and
 * quietest, who holds page one now.
 */
function card(report: StoredReport, move: Move, index: number): ContentTable {
  const quiet = (text: string) => ({ text, color: MUTED });
  return {
    unbreakable: true,
    style: "card",
    // The first move is the one to start with, and the only one filled in.
    layout: {
      defaultBorder: false,
      fillColor: () => (index === 0 ? SURFACE : null),
      paddingLeft: (column) => (column === 0 ? 12 : 0),
      paddingRight: (column) => (column === 0 ? 8 : 12),
      paddingTop: () => 10,
      paddingBottom: () => 10,
    },
    table: {
      widths: [NUMBER_COLUMN, "*"],
      body: [
        [
          {
            stack: [
              {
                text: move.searches === null ? "Unknown" : count(move.searches),
                style: move.searches === null ? "cardUnknown" : "cardNumber",
                noWrap: true,
              },
              { text: "searches a month", style: "cardCaption" },
              {
                text: move.difficulty
                  ? `Difficulty ${Math.round(move.difficulty)} of 100`
                  : "Difficulty unknown",
                style: "cardCaption",
                margin: [0, 2, 0, 2],
              },
              ...(move.difficulty
                ? [
                    {
                      canvas: [
                        { type: "rect", x: 0, y: 0, w: BAR, h: 3, color: RULE },
                        {
                          type: "rect",
                          x: 0,
                          y: 0,
                          w: (BAR * move.difficulty) / 100,
                          h: 3,
                          color: INK,
                        },
                      ],
                    } satisfies Content,
                  ]
                : []),
            ],
          },
          {
            stack: [
              {
                text: words(`${index + 1}. ${move.action}`),
                style: "cardTitle",
              },
              {
                text: [
                  quiet("For "),
                  ...words(move.keyword).map((run) => ({ ...run, bold: true })),
                  ...(move.page === null
                    ? [quiet(" on a new page")]
                    : [
                        quiet(" on "),
                        ...(mayLink(move.page, report.site, report.hosts)
                          ? [
                              {
                                text: move.page.replace(
                                  /^https?:\/\/(www\.)?/,
                                  "",
                                ),
                                link: move.page,
                                decoration: "underline" as const,
                                decorationColor: ACCENT,
                              },
                            ]
                          : words(move.page)),
                      ]),
                ],
                margin: [0, 0, 0, 3],
              },
              { text: words(move.why), margin: [0, 0, 0, 7] },
              steps(move.steps),
              {
                text: [quiet("On page one now: "), ...words(move.holders)],
                style: "cardCaption",
                margin: [0, 7, 0, 0],
              },
            ],
          },
        ],
      ],
    },
  };
}

/** The plan, for a report that has one as fields: a card for each move, best first. */
function plan(report: StoredReport): Content[] {
  if (!report.moves.length) return [];
  return [
    { text: "What to do, best first", style: "h2" },
    {
      text: "Best means the most searches for the least difficulty. The higher the difficulty, the harder it is to rank.",
      style: "small",
      margin: [0, -2, 0, 7],
    },
    ...report.moves.flatMap((move, index) => [
      // The filled first card needs no line above it.
      ...(index > 1 ? [rule()] : []),
      {
        ...card(report, move, index),
        ...(index === report.moves.length - 1
          ? { headlineLevel: Mark.PlanEnd }
          : {}),
      },
    ]),
    rule(),
    {
      text: [
        "This plan assumes your customer is ",
        ...words(report.customer.replace(/\.$/, "")),
        ". If that is wrong, the keywords change.",
      ],
      style: "small",
      unbreakable: true,
      margin: [0, 8, 0, 6],
    },
  ];
}

/** Where a marked part landed: on which page of how many, and how far down it. */
type Place = { page: number; pages: number; top: number };

function document(
  report: StoredReport,
  density: Density,
  landed: (mark: Mark, place: Place) => void,
): TDocumentDefinitions {
  const gap = (points: number) => points * density.gap;
  const { data, lastSection } = body(report);
  return {
    pageSize: "LETTER",
    pageMargins: [MARGIN, 48, MARGIN, 60],
    language: "en-US",
    info: {
      title: report.title,
      author: "OpenSEO",
      subject: `SEO report for ${report.site}`,
    },
    defaultStyle: {
      font: "Roboto",
      fontSize: density.font,
      lineHeight: density.leading,
      color: INK,
      fontFeatures: NO_LIGATURES,
    },
    styles: {
      h2: { fontSize: 14, bold: true, margin: [0, gap(14), 0, gap(6)] },
      h3: { fontSize: 11, bold: true, margin: [0, gap(12), 0, gap(4)] },
      paragraph: { margin: [0, 0, 0, gap(8)] },
      list: { margin: [0, 0, 0, gap(8)] },
      table: { fontSize: 8.5, lineHeight: 1.25, margin: [0, 2, 0, gap(12)] },
      small: { fontSize: 8.5, color: MUTED },
      card: { fontSize: density.card, lineHeight: density.cardLeading },
      cardNumber: { fontSize: 22, bold: true, lineHeight: 1 },
      cardUnknown: { fontSize: 16, bold: true, lineHeight: 1.3 },
      cardCaption: { fontSize: 8, color: MUTED, lineHeight: 1.1 },
      cardTitle: {
        fontSize: 12,
        bold: true,
        lineHeight: 1.2,
        margin: [0, 0, 0, 5],
      },
    },
    pageBreakBefore: (node, { getFollowingNodesOnPage }) => {
      if (node.headlineLevel)
        landed(node.headlineLevel, {
          page: node.startPosition.pageNumber,
          pages: node.pages,
          top: node.startPosition.verticalRatio,
        });
      return (
        node.headlineLevel === Mark.Heading &&
        getFollowingNodesOnPage().length === 0
      );
    },
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
        fontSize: 11,
        bold: true,
        color: MUTED,
        margin: [0, 12, 0, 4],
      },
      // The verdict is the largest thing on the page.
      {
        text: words(report.headline),
        fontSize: 18,
        bold: true,
        lineHeight: 1.2,
      },
      // Where the site is today, when the lookups had something to say.
      ...(report.standing
        ? [
            {
              text: words(report.standing),
              margin: [0, 5, 0, 0] as [number, number, number, number],
            },
          ]
        : []),
      ...plan(report),
      ...data,
      // The closing box never starts a page by itself: the report's last
      // section moves with it.
      {
        unbreakable: true,
        stack: [
          ...lastSection,
          {
            headlineLevel: Mark.Closing,
            margin: [0, gap(16), 0, 0],
            layout: {
              hLineWidth: () => 0.5,
              vLineWidth: () => 0.5,
              hLineColor: () => RULE,
              vLineColor: () => RULE,
              paddingLeft: () => 16,
              paddingRight: () => 16,
              paddingTop: () => 10,
              paddingBottom: () => 9,
            },
            table: {
              widths: ["*", "auto"],
              body: [
                [
                  {
                    fillColor: SURFACE,
                    border: [true, true, false, true],
                    stack: [
                      {
                        text: "Track these keywords in OpenSEO",
                        fontSize: 12,
                        bold: true,
                      },
                      {
                        text: `Free trial credits, and ${report.site} is already filled in.`,
                        style: "small",
                      },
                    ],
                  },
                  {
                    fillColor: SURFACE,
                    border: [false, true, true, true],
                    margin: [0, 3, 0, 0],
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
                            noWrap: true,
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
              ],
            },
          },
        ],
      },
    ],
  };
}

export async function reportPdf(report: StoredReport): Promise<Blob> {
  const draw = async (density: Density) => {
    const places = new Map<Mark, Place>();
    const blob = await pdfmake
      .createPdf(
        document(report, density, (mark, place) => places.set(mark, place)),
      )
      .getBlob();
    const closing = places.get(Mark.Closing);
    if (!closing) throw new Error("The report's closing box was not drawn.");
    return {
      blob,
      pages: closing.pages,
      // A report with no plan in fields has no cards to run over.
      planRunsOver: (places.get(Mark.PlanEnd)?.page ?? 1) > 1,
      endsSparse:
        closing.pages > 1 &&
        closing.page === closing.pages &&
        closing.top < SPARSE_PAGE,
    };
  };
  const normal = await draw(NORMAL);
  if (!normal.planRunsOver && !normal.endsSparse) return normal.blob;
  const tight = await draw(TIGHT);
  const better =
    (normal.planRunsOver && !tight.planRunsOver) || tight.pages < normal.pages;
  return (better ? tight : normal).blob;
}
