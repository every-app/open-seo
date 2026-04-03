import { Link } from "@tanstack/react-router";

export function SiteFooter({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-center gap-6">
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
  );
}
