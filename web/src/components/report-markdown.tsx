import type { ComponentProps } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { mayLink } from "@/lib/seo-report/links";

// How a written report is shown. The model that wrote it read pages anyone
// could have written, and nobody reads the report before it goes out. So the
// page decides what a report may carry, here, where the Markdown has already
// been parsed and a link is known to be a link however it was spelled:
//
// - No images at all.
// - A link stays a link only when it goes to the report's own site, a site
//   named on a results page the report checked, or openseo.so. Any other
//   link becomes its own words.
// - Raw HTML is never rendered: react-markdown shows it as text.
//
// This narrows what a hostile page can put under our name. It can't stop one
// shaping the words.

export function ReportMarkdown({
  markdown,
  site,
  hosts,
}: {
  markdown: string;
  site: string;
  hosts: readonly string[];
}) {
  const link = ({ href, children }: ComponentProps<"a">) =>
    mayLink(href, site, hosts) ? (
      <a
        href={href}
        rel="nofollow ugc noopener noreferrer"
        {...(href?.startsWith("#") ? {} : { target: "_blank" })}
      >
        {children}
      </a>
    ) : (
      <>{children}</>
    );
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      disallowedElements={["img"]}
      components={{
        a: link,
        table: (props) => (
          <div className="overflow-x-auto">
            <table>{props.children}</table>
          </div>
        ),
      }}
    >
      {markdown}
    </Markdown>
  );
}
