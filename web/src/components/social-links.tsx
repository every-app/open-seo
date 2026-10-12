const socialLinks = [
  { label: "YouTube", href: "https://www.youtube.com/@openseo_so" },
  { label: "X", href: "https://x.com/openseo_so" },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/openseo-so" },
  { label: "Instagram", href: "https://www.instagram.com/openseo.so/" },
];

export function SocialLinks() {
  return (
    <nav
      aria-label="OpenSEO social media"
      className="flex flex-wrap gap-x-5 gap-y-1"
    >
      {socialLinks.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-11 items-center font-medium underline decoration-neutral-300 underline-offset-4 transition-colors hover:text-neutral-900 hover:decoration-neutral-900 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-neutral-900"
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
}
