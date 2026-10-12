import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { expect, it, vi } from "vitest";
import { mapBacklinksRows } from "@/server/features/backlinks/services/backlinksRowMappers";
import { BacklinksTable } from "./BacklinksTable";

it("distinguishes zero from missing spam scores without changing boundary values", () => {
  const rows = mapBacklinksRows(
    [undefined, null, 0, 39, 40].map((score) => ({
      url_from: "https://openseo.so/",
      backlink_spam_score: score,
    })),
  );
  const html = renderToStaticMarkup(
    createElement(BacklinksTable, {
      rows,
      domainRatings: null,
      sorting: [],
      onSortingChange: vi.fn(),
      expansion: null,
    }),
  );
  const $ = load(html);
  const scores = $("tbody tr")
    .map((_, row) => $(row).find("td").eq(6).text())
    .get();
  expect(scores).toEqual(["-", "-", "0", "39", "40"]);
  expect($("[title='Spam score unknown']")).toHaveLength(2);
});
