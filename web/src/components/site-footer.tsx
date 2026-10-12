import { Link } from "@tanstack/react-router";
import { SocialLinks } from "@/components/social-links";
import { featureGroups } from "@/lib/feature-pages";
import { freeToolList } from "@/lib/free-tools/tool-pages";

const featureLinks = featureGroups.flatMap((group) =>
  group.pages.map((page) => ({
    label: page.eyebrow,
    href: `/features/${page.slug}`,
  })),
);

export function SiteFooter({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Link to="/" className="text-sm font-semibold text-neutral-900">
        OpenSEO
      </Link>

      <div className="mt-6 grid grid-cols-2 gap-8 md:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]">
        <div>
          <p className="font-semibold text-neutral-900">Features</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {featureLinks.map((link) => (
              <a key={link.href} href={link.href}>
                {link.label}
              </a>
            ))}
            <Link to="/features">All features</Link>
          </div>
        </div>

        <div className="flex flex-col gap-8">
          <div>
            <p className="font-semibold text-neutral-900">AI agents</p>
            <div className="mt-2 flex flex-col gap-1.5">
              <Link to="/features/mcp">OpenSEO MCP</Link>
              <Link to="/google-search-console-mcp">
                Google Search Console MCP
              </Link>
            </div>
          </div>

          <div>
            <p className="font-semibold text-neutral-900">Compare</p>
            <div className="mt-2 flex flex-col gap-1.5">
              <Link to="/openseo-vs-dataforseo">OpenSEO vs DataForSEO</Link>
              <Link to="/semrush-alternative">Semrush alternative</Link>
              <Link to="/semrush-pricing">Semrush pricing</Link>
              <Link to="/ahrefs-alternative">Ahrefs alternative</Link>
              <Link to="/ahrefs-pricing">Ahrefs pricing</Link>
            </div>
          </div>
        </div>

        <div>
          <p className="font-semibold text-neutral-900">Resources</p>
          <div className="mt-2 flex flex-col gap-1.5">
            <a href="/docs/mcp">MCP</a>
            <a href="/docs/skills">Skills</a>
            <Link to="/library">Strategy Library</Link>
            <Link to="/open-source-seo">Why Open Source?</Link>
            <Link to="/blogs">Blog</Link>
            <a href="/docs">Docs</a>
          </div>
        </div>

        <div>
          <p className="font-semibold text-neutral-900">Free Tools</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {freeToolList.map((tool) => (
              <a key={tool.slug} href={tool.path}>
                {tool.name}
              </a>
            ))}
            <Link to="/google-search-console-mcp">
              Google Search Console MCP
            </Link>
            <Link to="/tools">All free tools</Link>
          </div>
        </div>

        <div>
          <p className="font-semibold text-neutral-900">Company</p>
          <div className="mt-2 flex flex-col gap-1.5">
            <Link to="/about">About</Link>
            <Link to="/why-openseo">Why OpenSEO</Link>
            <Link to="/support">Support</Link>
            <Link to="/roadmap">Roadmap</Link>
            <Link to="/pricing">Pricing</Link>
            <a
              href="https://github.com/every-app/open-seo"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <a
              href="https://discord.gg/c9uGs3cFXr"
              target="_blank"
              rel="noopener noreferrer"
            >
              Discord
            </a>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms-and-conditions">Terms</Link>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <a
          href="https://www.ycombinator.com/companies/openseo"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center gap-2.5 rounded-md border border-neutral-300 bg-white/60 px-3 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#ff6600]"
        >
          <img src="/y-combinator.svg" alt="" width={24} height={24} />
          <span>Backed by Y Combinator</span>
        </a>
        <SocialLinks />
      </div>
    </div>
  );
}
