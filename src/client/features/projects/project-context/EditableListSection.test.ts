import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { expect, it, vi } from "vitest";
import { EditableListSection } from "./EditableListSection";

vi.mock("./shared", () => ({
  RowActions: ({ children }: { children: ReactNode }) => children,
  listClass: "",
}));

type Item = { id: string; label: string };

it("keeps context list drafts in place while a save is pending", () => {
  const html = renderToStaticMarkup(
    createElement(EditableListSection<Item>, {
      title: "Competitors",
      hint: "Competitor sites",
      addLabel: "Add competitor",
      emptyTitle: "No competitors",
      emptyDescription: "Add one",
      items: [{ id: "a", label: "alpha.com" }],
      getId: (item) => item.id,
      getLabel: (item) => item.label,
      renderItem: (item) => item.label,
      renderForm: () => null,
      onRemove: vi.fn(),
      pending: true,
    }),
  );
  const $ = load(html);

  expect($("button:contains('Add competitor')").is(":disabled")).toBe(true);
  expect($("button[aria-label='Edit alpha.com']").is(":disabled")).toBe(true);
});
