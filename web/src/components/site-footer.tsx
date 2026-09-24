import { Link } from "@tanstack/react-router";
import { brand } from "@/lib/brand";
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
        {brand.name}
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

        <div>
          <p className="font-semibold text-neutral-900">AI agents</p>
          <div className="mt-2 flex flex-col gap-1.5">
            <Link to="/features/mcp">{brand.name} MCP</Link>
            <Link to="/google-search-console-mcp">
              Google Search Console MCP
            </Link>
          </div>
        </div>

        <div>
          <p className="font-semibold text-neutral-900">Resources</p>
          <div className="mt-2 flex flex-col gap-1.5">
            <a href="/docs/mcp">MCP</a>
            <a href="/docs/skills">Skills</a>
            <Link to="/library">Strategy Library</Link>
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
            <Link to="/why-seoshark">Why {brand.name}</Link>
            <Link to="/support">Support</Link>
            <Link to="/roadmap">Roadmap</Link>
            <Link to="/pricing">Pricing</Link>
            <a href={brand.githubUrl} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
            {brand.discordUrl ? (
              <a
                href={brand.discordUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Discord
              </a>
            ) : null}
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms-and-conditions">Terms</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
