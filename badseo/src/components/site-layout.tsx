import type { ReactNode } from "react";

export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav className="nav">
        <a className="brand" href="/">
          badseo.dev
        </a>
        <a className="nav-link" href="/catalog">
          Catalog
        </a>
      </nav>
      {children}
      <footer className="foot">
        <div className="foot-inner">
          <span>
            badseo.dev is maintained by OpenSEO. Every page here is broken on
            purpose.
          </span>
          <span className="foot-links">
            <a href="/catalog">Catalog</a>
            <a href="https://github.com/every-app/open-seo">GitHub</a>
            <a href="https://openseo.so">OpenSEO</a>
          </span>
        </div>
      </footer>
      <a
        className="openseo-badge"
        href="https://openseo.so"
        title="Audit a site with OpenSEO"
      >
        <span className="openseo-mark" aria-hidden="true" />
        <span className="badge-label">Maintained by </span>
        <strong>OpenSEO</strong>
      </a>
    </>
  );
}
