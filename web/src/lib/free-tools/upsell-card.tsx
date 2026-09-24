import type { ReactNode } from "react";
import { appLinks, brand } from "@/lib/brand";
import { trackTool } from "@/lib/free-tools/analytics";

const SIGNUP_URL = appLinks.signUp;

/** Shown under truncated results: what the free run leaves out, and the CTA. */
export function UpsellCard({
  tool,
  children,
  cta = `Explore more in ${brand.name}`,
}: {
  tool: string;
  children: ReactNode;
  cta?: string;
}) {
  return (
    <div className="mt-4 rounded-xl border border-[var(--color-border-subtle)] bg-white p-5 md:p-6">
      <p className="text-sm leading-6 text-neutral-700">{children}</p>
      <div className="mt-3">
        <a
          href={SIGNUP_URL}
          onClick={() => trackTool("tool_cta_click", tool)}
          className="inline-flex min-h-11 max-w-full items-center justify-center py-2 rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          {cta}
          <span aria-hidden="true" className="ml-2">
            &rarr;
          </span>
        </a>
      </div>
    </div>
  );
}
