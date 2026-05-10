import { Link } from "@tanstack/react-router";

export function SiteFooter({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="grid gap-6 sm:grid-cols-3">
        <div>
          <p className="font-semibold text-neutral-900">Product</p>
          <div className="mt-2 flex flex-col gap-1.5">
            <Link to="/">OpenSEO</Link>
            <Link to="/features/mcp">MCP</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/guides">Guides</Link>
          </div>
        </div>
        <div>
          <p className="font-semibold text-neutral-900">Community</p>
          <div className="mt-2 flex flex-col gap-1.5">
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
          </div>
        </div>
        <div>
          <p className="font-semibold text-neutral-900">Legal</p>
          <div className="mt-2 flex flex-col gap-1.5">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms-and-conditions">Terms</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
