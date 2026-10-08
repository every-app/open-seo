/**
 * Canonical marketing landing page.
 *
 * The page uses a soft cream canvas, restrained hairline surfaces, charcoal
 * type, and a single orange emphasis moment around the MCP section.
 */

import {
  type ReactNode,
  type SVGProps,
  useEffect,
  useRef,
  useState,
} from "react";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { ProductHuntLaurel } from "@/components/product-hunt-laurel";
import { SiteFooter } from "@/components/site-footer";
import { featurePages } from "@/lib/feature-pages";
import { getAgentSetupPrompt } from "../../../src/client/features/ai-mcp/agentSetupPrompt";
import "./landing-page.css";

const SIGNUP_URL = "https://app.openseo.so/sign-up";
const PRODUCT_HUNT_URL =
  "https://www.producthunt.com/products/openseo?launch=openseo";
const GITHUB_URL = "https://github.com/every-app/open-seo";
const DISCORD_URL = "https://discord.gg/c9uGs3cFXr";

type Testimonial = {
  quote: string;
  name: string;
  initial: string;
  handle: string;
  href: string;
  network: "x" | "linkedin" | "web";
  avatarSrc?: string;
};

const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "All of the value, none of the bloat. OpenSEO is a no-brainer compared to the expensive alternatives!",
    name: "Fed",
    initial: "F",
    handle: "@foliofed",
    href: "https://x.com/foliofed",
    network: "x",
    avatarSrc: "/avatars/fed-avatar.jpg",
  },
  {
    quote:
      "I've been using OpenSEO for the past 3 months, Ben keeps launching features to make it the best. I use it every day to find where my competitors are ranking.",
    name: "Samik",
    initial: "S",
    handle: "Subclip",
    href: "https://www.subclip.app/",
    network: "web",
    avatarSrc: "/avatars/samik-avatar.jpg",
  },
  {
    quote:
      "It's so straightforward and incredibly easy to get started. OpenSEO gives you the complete setup, stripped of all the fluff that you get elsewhere.",
    name: "Tom Raine",
    initial: "T",
    handle: "LinkedIn",
    href: "https://www.linkedin.com/in/tom-raine-hk/",
    network: "linkedin",
    avatarSrc: "/avatars/tom-avatar.jpeg",
  },
];

// ─── Icons (inline SVG only, per project convention) ─────────────────

type IconProps = { size?: number; className?: string };

function strokeProps(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

function IconArrowRight({ size = 16, className }: IconProps) {
  return (
    <svg {...strokeProps(size, className)}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function IconCopy({ size = 16, className }: IconProps) {
  return (
    <svg {...strokeProps(size, className)}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconGithub({ size = 16, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function IconX({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function IconLinkedIn({ size = 14, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.07 2.07 0 110-4.14 2.07 2.07 0 010 4.14zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.22.79 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
    </svg>
  );
}

function IconLink({ size = 14, className }: IconProps) {
  return (
    <svg {...strokeProps(size, className)}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function IconDiscord({ size = 18, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

// ─── Shared bits ─────────────────────────────────────────────────────

function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`itc-container ${className}`}>{children}</div>;
}

function ArrowCta({
  href = SIGNUP_URL,
  className = "itc-btn itc-btn-primary",
  children = "Start enjoying SEO",
  size = "md",
}: {
  href?: string;
  className?: string;
  children?: ReactNode;
  size?: "md" | "lg";
}) {
  return (
    <a
      href={href}
      className={`${className}${size === "lg" ? " itc-btn-lg" : ""}`}
    >
      {children}
      <IconArrowRight size={size === "lg" ? 18 : 16} className="itc-arrow" />
    </a>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="itc-hero">
      <Container>
        <a
          href={PRODUCT_HUNT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="itc-hero-ph-laurel"
          aria-label="Number 1 Product of the Day on Product Hunt"
        >
          <ProductHuntLaurel />
        </a>
        <h1
          className="itc-display-xl itc-hero-title"
          style={{ maxWidth: 1180, margin: "0 auto" }}
        >
          SEO made simple.
        </h1>
        <p
          className="itc-subhead itc-muted itc-hero-subtitle"
          style={{ maxWidth: 640, margin: "24px auto 0" }}
        >
          Connect your favorite AI agent in 2 minutes. OpenSEO gives the data
          and tools you need to grow your business&apos;s organic traffic.
        </p>
        <div className="itc-hero-ctas">
          <div className="itc-hero-cta-group">
            <ArrowCta size="lg" />
            <p className="itc-hero-cta-note">No credit card required</p>
          </div>
        </div>
      </Container>
    </section>
  );
}

// ─── Testimonial (true-black inverse strip) ──────────────────────────

function Testimonial() {
  return (
    <section className="itc-inverse">
      <Container>
        <div className="itc-testimonials">
          <h2
            className="itc-display-md itc-testimonials-title"
            style={{ margin: "0 auto 32px" }}
          >
            Trusted by 3,000+ entrepreneurs
          </h2>
          <div className="itc-quote-grid">
            {TESTIMONIALS.map((t) => (
              <figure className="itc-quote-card" key={t.name}>
                <div className="itc-quote-mark" aria-hidden="true">
                  &ldquo;
                </div>
                <blockquote className="itc-quote-text">{t.quote}</blockquote>
                <figcaption className="itc-quote-attr">
                  <span className="itc-quote-avatar" aria-hidden="true">
                    {t.avatarSrc ? (
                      <img
                        src={t.avatarSrc}
                        alt=""
                        className="itc-quote-avatar-img"
                      />
                    ) : (
                      t.initial
                    )}
                  </span>
                  <span className="itc-quote-meta">
                    <span className="itc-quote-name">{t.name}</span>
                    <a
                      href={t.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="itc-quote-handle"
                    >
                      {t.network === "x" ? (
                        <IconX size={11} />
                      ) : t.network === "linkedin" ? (
                        <IconLinkedIn size={12} />
                      ) : (
                        <IconLink size={12} />
                      )}
                      {t.handle}
                    </a>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}

// ─── Product ─────────────────────────────────────────────────────────

const FEATURE_CARDS = [
  {
    page: featurePages.keywordResearch,
    blurb: "Find ideas, demand, difficulty, intent, and live SERPs.",
  },
  {
    page: featurePages.domainOverview,
    blurb: "Estimate organic traffic and ranking keywords.",
  },
  {
    page: featurePages.backlinks,
    blurb: "Inspect backlinks, referring domains, and link quality.",
  },
  {
    page: featurePages.rankTracking,
    blurb: "Track keyword positions over time.",
  },
  {
    page: featurePages.siteAudit,
    blurb: "Crawl pages and surface technical issues.",
  },
  {
    page: featurePages.aiBrandVisibility,
    blurb: "Review AI mentions, citations, and prompts.",
  },
  {
    page: featurePages.aiSearchPrompts,
    blurb: "Compare prompts across supported AI models.",
  },
  {
    page: featurePages.savedKeywords,
    blurb: "Organize ideas for content and tracking.",
  },
];

function DemoVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);

  return (
    <div className="itc-demo-video">
      <video
        ref={videoRef}
        style={{ width: "100%", display: "block" }}
        width={1440}
        height={900}
        poster="/demo-poster.webp"
        loop
        playsInline
        controls={playing}
        preload="metadata"
        aria-label="OpenSEO product demo: keyword research, backlinks, site audit, and an agent report"
        onPlay={() => setPlaying(true)}
      >
        <source src="/demo.mp4" type="video/mp4" />
      </video>
      {!playing && (
        <button
          type="button"
          className="itc-demo-play"
          onClick={() => void videoRef.current?.play()}
          aria-label="Play the OpenSEO demo video"
        >
          <span className="itc-demo-play-button" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="36" height="36" fill="currentColor">
              <path d="M8.5 5v14l12-7z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}

function ProductSection() {
  return (
    <section className="itc-section itc-section-demo">
      <Container>
        <div className="itc-narrow">
          <h2 className="itc-display-lg">See OpenSEO in action</h2>
          <p className="itc-subhead itc-muted" style={{ margin: "20px 0 0" }}>
            Keyword research, competitor analysis, backlinks, rank tracking,
            technical audits, and AI-search visibility, all on real DataForSEO
            data and connected to each other.
          </p>
        </div>

        <div className="itc-mockup" style={{ marginTop: 48 }}>
          <div className="itc-mockup-media" style={{ aspectRatio: "1440/900" }}>
            <DemoVideo />
          </div>
        </div>

        <div className="itc-feature-list-grid">
          {FEATURE_CARDS.map(({ page, blurb }) => (
            <a
              key={page.slug}
              href={`/features/${page.slug}`}
              className="itc-card itc-feature-list-card"
            >
              <p style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>
                {page.eyebrow}
              </p>
              <p
                className="itc-body-sm itc-muted"
                style={{ margin: "8px 0 0" }}
              >
                {blurb}
              </p>
            </a>
          ))}
        </div>

        <div className="itc-feature-more-header">
          <a href="/features" className="itc-textlink">
            All features <IconArrowRight size={15} className="itc-arrow" />
          </a>
        </div>
      </Container>
    </section>
  );
}

// ─── MCP: the page's one Fin Orange moment ───────────────────────────

type McpClient = {
  name: string;
  Icon: (props: SVGProps<SVGSVGElement>) => ReactNode;
};

const MCP_CLIENTS: McpClient[] = [
  { name: "Claude", Icon: ClaudeIcon },
  { name: "Codex", Icon: CodexIcon },
  { name: "OpenClaw", Icon: OpenClawIcon },
  { name: "OpenCode", Icon: OpenCodeIcon },
  { name: "Gemini", Icon: GeminiIcon },
];

const RECOMMENDED_SKILLS = [
  {
    slug: "seo-coach",
    blurb: "Learn how to start with SEO.",
  },
  {
    slug: "seo-audit",
    blurb: "What 1-2 things will drive more traffic?",
  },
  {
    slug: "keyword-research",
    blurb: "Find topics worth writing about.",
  },
  {
    slug: "competitor-analysis",
    blurb: "Understand your competitor's strategy.",
  },
];

function SkillsList() {
  return (
    <ul className="itc-skill-list">
      {RECOMMENDED_SKILLS.map((skill) => (
        <li key={skill.slug}>
          <code className="itc-skill-code">{skill.slug}</code>
          <span className="itc-skill-blurb">{skill.blurb}</span>
        </li>
      ))}
    </ul>
  );
}

const SETUP_PROMPT = getAgentSetupPrompt("https://app.openseo.so");

function CopySetupPrompt() {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(id);
  }, [toast]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(SETUP_PROMPT);
      setToast(
        "Copied! Paste into Codex or your agent. ChatGPT uses the setup guide.",
      );
    } catch {
      setToast("Couldn't copy. Use the setup guide instead.");
    }
  }

  return (
    <>
      <button type="button" onClick={copy} className="itc-btn itc-btn-fin">
        <IconCopy size={16} />
        Copy agent setup prompt
      </button>
      <div className="itc-toast-region" role="status" aria-live="polite">
        {toast ? <div className="itc-toast">{toast}</div> : null}
      </div>
    </>
  );
}

function McpSection() {
  return (
    <section className="itc-mcp-section">
      <Container>
        <div className="itc-mcp-grid">
          <div>
            <h2 className="itc-display-lg">Get superpowers with the MCP</h2>
            <SkillsList />
            <div className="itc-agent-icons">
              {MCP_CLIENTS.map(({ name, Icon }) => (
                <span key={name} className="itc-agent-icon" title={name}>
                  <Icon aria-hidden="true" />
                  <span
                    style={{
                      clip: "rect(0 0 0 0)",
                      clipPath: "inset(50%)",
                      height: 1,
                      overflow: "hidden",
                      position: "absolute",
                      whiteSpace: "nowrap",
                      width: 1,
                    }}
                  >
                    {name}
                  </span>
                </span>
              ))}
            </div>
            <p className="itc-body itc-mcp-chatgpt-note">
              For ChatGPT on the web,{" "}
              <a href="/docs/chatgpt" className="itc-inline-link">
                follow the ChatGPT setup steps
              </a>
              .
            </p>
            <div className="itc-mcp-ctas">
              <CopySetupPrompt />
              <a href="/docs/agent-setup" className="itc-textlink">
                Setup guide <IconArrowRight size={15} className="itc-arrow" />
              </a>
            </div>
          </div>

          <div className="itc-terminal">
            <div className="itc-terminal-bar">
              <span style={{ display: "flex", gap: 6 }} aria-hidden="true">
                <span className="itc-terminal-dot" />
                <span className="itc-terminal-dot" />
                <span className="itc-terminal-dot" />
              </span>
              <span className="itc-terminal-label">claude · openseo mcp</span>
            </div>
            <pre>
              <code>
                <span className="t-orange">›</span> find and cluster keywords
                for <span className="t-bright">openseo.so</span>
                {"\n\n"}
                <span className="t-dim">
                  ⏺ openseo.keyword_research(seed: &quot;open source seo&quot;)
                </span>
                {"\n"}
                {"  "}keyword{"                      "}volume{"     "}kd{"\n"}
                {"  "}open source seo{"              "}
                <span className="t-bright">1,300</span>
                {"      "}
                <span className="t-dim">12</span>
                {"\n"}
                {"  "}open source seo tools{"        "}
                <span className="t-bright">720</span>
                {"        "}
                <span className="t-dim">9</span>
                {"\n"}
                {"  "}self-hosted seo platform{"     "}
                <span className="t-bright">210</span>
                {"        "}
                <span className="t-dim">4</span>
                {"\n\n"}
                <span className="t-orange">✓</span>
                <span className="t-dim">
                  {" "}
                  Saved 3 keywords to your workspace.
                </span>
                {"\n"}
                <span className="t-orange">↳</span>
                <span className="t-dim"> View data in app: </span>
                <span className="t-bright">app.openseo.so/keywords</span>
              </code>
            </pre>
          </div>
        </div>
      </Container>
    </section>
  );
}

function ClaudeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid"
      viewBox="0 0 256 257"
      {...props}
    >
      <path
        fill="#D97757"
        d="m50.228 170.321 50.357-28.257.843-2.463-.843-1.361h-2.462l-8.426-.518-28.775-.778-24.952-1.037-24.175-1.296-6.092-1.297L0 125.796l.583-3.759 5.12-3.434 7.324.648 16.202 1.101 24.304 1.685 17.629 1.037 26.118 2.722h4.148l.583-1.685-1.426-1.037-1.101-1.037-25.147-17.045-27.22-18.017-14.258-10.37-7.713-5.25-3.888-4.925-1.685-10.758 7-7.713 9.397.649 2.398.648 9.527 7.323 20.35 15.75L94.817 91.9l3.889 3.24 1.555-1.102.195-.777-1.75-2.917-14.453-26.118-15.425-26.572-6.87-11.018-1.814-6.61c-.648-2.723-1.102-4.991-1.102-7.778l7.972-10.823L71.42 0 82.05 1.426l4.472 3.888 6.61 15.101 10.694 23.786 16.591 32.34 4.861 9.592 2.592 8.879.973 2.722h1.685v-1.556l1.36-18.211 2.528-22.36 2.463-28.776.843-8.1 4.018-9.722 7.971-5.25 6.222 2.981 5.12 7.324-.713 4.73-3.046 19.768-5.962 30.98-3.889 20.739h2.268l2.593-2.593 10.499-13.934 17.628-22.036 7.778-8.749 9.073-9.657 5.833-4.601h11.018l8.1 12.055-3.628 12.443-11.342 14.388-9.398 12.184-13.48 18.147-8.426 14.518.778 1.166 2.01-.194 30.46-6.481 16.462-2.982 19.637-3.37 8.88 4.148.971 4.213-3.5 8.62-20.998 5.184-24.628 4.926-36.682 8.685-.454.324.519.648 16.526 1.555 7.065.389h17.304l32.21 2.398 8.426 5.574 5.055 6.805-.843 5.184-12.962 6.611-17.498-4.148-40.83-9.721-14-3.5h-1.944v1.167l11.666 11.406 21.387 19.314 26.767 24.887 1.36 6.157-3.434 4.86-3.63-.518-23.526-17.693-9.073-7.972-20.545-17.304h-1.36v1.814l4.73 6.935 25.017 37.59 1.296 11.536-1.814 3.76-6.481 2.268-7.13-1.297-14.647-20.544-15.1-23.138-12.185-20.739-1.49.843-7.194 77.448-3.37 3.953-7.778 2.981-6.48-4.925-3.436-7.972 3.435-15.749 4.148-20.544 3.37-16.333 3.046-20.285 1.815-6.74-.13-.454-1.49.194-15.295 20.999-23.267 31.433-18.406 19.702-4.407 1.75-7.648-3.954.713-7.064 4.277-6.286 25.47-32.405 15.36-20.092 9.917-11.6-.065-1.686h-.583L44.07 198.125l-12.055 1.555-5.185-4.86.648-7.972 2.463-2.593 20.35-13.999-.064.065Z"
      />
    </svg>
  );
}

function CodexIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      fill="#111"
      fillRule="evenodd"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path
        clipRule="evenodd"
        d="M8.086.457a6.105 6.105 0 013.046-.415c1.333.153 2.521.72 3.564 1.7a.117.117 0 00.107.029c1.408-.346 2.762-.224 4.061.366l.063.03.154.076c1.357.703 2.33 1.77 2.918 3.198.278.679.418 1.388.421 2.126a5.655 5.655 0 01-.18 1.631.167.167 0 00.04.155 5.982 5.982 0 011.578 2.891c.385 1.901-.01 3.615-1.183 5.14l-.182.22a6.063 6.063 0 01-2.934 1.851.162.162 0 00-.108.102c-.255.736-.511 1.364-.987 1.992-1.199 1.582-2.962 2.462-4.948 2.451-1.583-.008-2.986-.587-4.21-1.736a.145.145 0 00-.14-.032c-.518.167-1.04.191-1.604.185a5.924 5.924 0 01-2.595-.622 6.058 6.058 0 01-2.146-1.781c-.203-.269-.404-.522-.551-.821a7.74 7.74 0 01-.495-1.283 6.11 6.11 0 01-.017-3.064.166.166 0 00.008-.074.115.115 0 00-.037-.064 5.958 5.958 0 01-1.38-2.202 5.196 5.196 0 01-.333-1.589 6.915 6.915 0 01.188-2.132c.45-1.484 1.309-2.648 2.577-3.493.282-.188.55-.334.802-.438.286-.12.573-.22.861-.304a.129.129 0 00.087-.087A6.016 6.016 0 015.635 2.31C6.315 1.464 7.132.846 8.086.457zm-.804 7.85a.848.848 0 00-1.473.842l1.694 2.965-1.688 2.848a.849.849 0 001.46.864l1.94-3.272a.849.849 0 00.007-.854l-1.94-3.393zm5.446 6.24a.849.849 0 000 1.695h4.848a.849.849 0 000-1.696h-4.848z"
      />
    </svg>
  );
}

function OpenClawIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <defs>
        <linearGradient
          id="intercom-openclaw-lobster-gradient"
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor="#ff4d4d" />
          <stop offset="100%" stopColor="#991b1b" />
        </linearGradient>
      </defs>
      <path
        d="M60 10 C30 10 15 35 15 55 C15 75 30 95 45 100 L45 110 L55 110 L55 100 C55 100 60 102 65 100 L65 110 L75 110 L75 100 C90 95 105 75 105 55 C105 35 90 10 60 10Z"
        fill="url(#intercom-openclaw-lobster-gradient)"
      />
      <path
        d="M20 45 C5 40 0 50 5 60 C10 70 20 65 25 55 C28 48 25 45 20 45Z"
        fill="url(#intercom-openclaw-lobster-gradient)"
      />
      <path
        d="M100 45 C115 40 120 50 115 60 C110 70 100 65 95 55 C92 48 95 45 100 45Z"
        fill="url(#intercom-openclaw-lobster-gradient)"
      />
      <path
        d="M45 15 Q35 5 30 8"
        stroke="#ff4d4d"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <path
        d="M75 15 Q85 5 90 8"
        stroke="#ff4d4d"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <circle cx="45" cy="35" r="6" fill="#050810" />
      <circle cx="75" cy="35" r="6" fill="#050810" />
      <circle cx="46" cy="34" r="2.5" fill="#00e5cc" />
      <circle cx="76" cy="34" r="2.5" fill="#00e5cc" />
    </svg>
  );
}

function OpenCodeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <rect width="512" height="512" fill="#FDFCFC" />
      <path d="M320 224V352H192V224H320Z" fill="#E6E5E6" />
      <path
        fill="#17181C"
        fillRule="evenodd"
        d="M384 416H128V96H384V416ZM320 160H192V352H320V160Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function GeminiIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 296 298"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      {...props}
    >
      <mask
        id="intercom-gemini-a"
        width="296"
        height="298"
        x="0"
        y="0"
        maskUnits="userSpaceOnUse"
        style={{ maskType: "alpha" }}
      >
        <path
          fill="#3186FF"
          d="M141.201 4.886c2.282-6.17 11.042-6.071 13.184.148l5.985 17.37a184.004 184.004 0 0 0 111.257 113.049l19.304 6.997c6.143 2.227 6.156 10.91.02 13.155l-19.35 7.082a184.001 184.001 0 0 0-109.495 109.385l-7.573 20.629c-2.241 6.105-10.869 6.121-13.133.025l-7.908-21.296a184 184 0 0 0-109.02-108.658l-19.698-7.239c-6.102-2.243-6.118-10.867-.025-13.132l20.083-7.467A183.998 183.998 0 0 0 133.291 26.28l7.91-21.394Z"
        />
      </mask>
      <g mask="url(#intercom-gemini-a)">
        <g filter="url(#intercom-gemini-b)">
          <ellipse cx="163" cy="149" fill="#3689FF" rx="196" ry="159" />
        </g>
        <g filter="url(#intercom-gemini-c)">
          <ellipse cx="33.5" cy="142.5" fill="#F6C013" rx="68.5" ry="72.5" />
        </g>
        <g filter="url(#intercom-gemini-d)">
          <ellipse cx="19.5" cy="148.5" fill="#F6C013" rx="68.5" ry="72.5" />
        </g>
        <g filter="url(#intercom-gemini-e)">
          <path
            fill="#FA4340"
            d="M194 10.5C172 82.5 65.5 134.333 22.5 135L144-66l50 76.5Z"
          />
        </g>
        <g filter="url(#intercom-gemini-f)">
          <path
            fill="#FA4340"
            d="M190.5-12.5C168.5 59.5 62 111.333 19 112L140.5-89l50 76.5Z"
          />
        </g>
        <g filter="url(#intercom-gemini-g)">
          <path
            fill="#14BB69"
            d="M194.5 279.5C172.5 207.5 66 155.667 23 155l121.5 201 50-76.5Z"
          />
        </g>
        <g filter="url(#intercom-gemini-h)">
          <path
            fill="#14BB69"
            d="M196.5 320.5C174.5 248.5 68 196.667 25 196l121.5 201 50-76.5Z"
          />
        </g>
      </g>
      <defs>
        <filter
          id="intercom-gemini-b"
          width="464"
          height="390"
          x="-69"
          y="-46"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur
            result="effect1_foregroundBlur_69_17998"
            stdDeviation="18"
          />
        </filter>
        <filter
          id="intercom-gemini-c"
          width="265"
          height="273"
          x="-99"
          y="6"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur
            result="effect1_foregroundBlur_69_17998"
            stdDeviation="32"
          />
        </filter>
        <filter
          id="intercom-gemini-d"
          width="265"
          height="273"
          x="-113"
          y="12"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur
            result="effect1_foregroundBlur_69_17998"
            stdDeviation="32"
          />
        </filter>
        <filter
          id="intercom-gemini-e"
          width="299.5"
          height="329"
          x="-41.5"
          y="-130"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur
            result="effect1_foregroundBlur_69_17998"
            stdDeviation="32"
          />
        </filter>
        <filter
          id="intercom-gemini-f"
          width="299.5"
          height="329"
          x="-45"
          y="-153"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur
            result="effect1_foregroundBlur_69_17998"
            stdDeviation="32"
          />
        </filter>
        <filter
          id="intercom-gemini-g"
          width="299.5"
          height="329"
          x="-41"
          y="91"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur
            result="effect1_foregroundBlur_69_17998"
            stdDeviation="32"
          />
        </filter>
        <filter
          id="intercom-gemini-h"
          width="299.5"
          height="329"
          x="-39"
          y="132"
          colorInterpolationFilters="sRGB"
          filterUnits="userSpaceOnUse"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape" />
          <feGaussianBlur
            result="effect1_foregroundBlur_69_17998"
            stdDeviation="32"
          />
        </filter>
      </defs>
    </svg>
  );
}

// ─── Beyond the data ─────────────────────────────────────────────────

function IconSearchConsole(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="#458CF5" {...props}>
      <path d="M8.548 1.156L6.832 2.872v1.682h1.716zm0 3.398v.035H6.832v-.035H3.386L0 7.844v3.577h2.826V8.94c0-.525.429-.954.954-.954h16.476c.525 0 .954.43.954.954v2.48h2.754V7.844l-3.386-3.29H17.3v.035h-1.717v-.035zm7.035 0H17.3V2.872l-1.717-1.716zM8.679 1.188V2.84h6.773V1.188zm11.471 7.07a.834.834 0 00-.132.01l-.543.002c-5.216.014-10.432-.008-15.648.01-.435-.063-.794.436-.716.883v2.264h17.812c-.016-.888.045-1.782-.034-2.666-.104-.342-.427-.502-.739-.502zm-15.422.634a.689.698 0 01.689.698.689.698 0 01-.689.697.689.698 0 01-.688-.697.689.698 0 01.688-.698zm2.134 0a.689.698 0 01.689.698.689.698 0 01-.689.697.689.698 0 01-.688-.697.689.698 0 01.688-.698zM.036 11.645v9.156c0 1.05.858 1.908 1.907 1.908h.883V11.645zm21.174 0v11.064h.882c1.05 0 1.908-.858 1.908-1.908v-9.156zM4.057 13.133v6.85h6.137v-6.85zm13.243.021v3.777l-1.708.977-1.708-.977v-3.758a4.006 4.006 0 000 7.23v2.441h3.457v-2.442a4.006 4.006 0 00-.041-7.248zm-13.243 8.26v1.43h7.925v-1.43z" />
    </svg>
  );
}

function IconGoogleAnalytics(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="#E37400" {...props}>
      <path d="M22.84 2.9982v17.9987c.0086 1.6473-1.3197 2.9897-2.967 2.9984a2.9808 2.9808 0 01-.3677-.0208c-1.528-.226-2.6477-1.5558-2.6105-3.1V3.1204c-.0369-1.5458 1.0856-2.8762 2.6157-3.1 1.6361-.1915 3.1178.9796 3.3093 2.6158.014.1201.0208.241.0202.3619zM4.1326 18.0548c-1.6417 0-2.9726 1.331-2.9726 2.9726C1.16 22.6691 2.4909 24 4.1326 24s2.9726-1.3309 2.9726-2.9726-1.331-2.9726-2.9726-2.9726zm7.8728-9.0098c-.0171 0-.0342 0-.0513.0003-1.6495.0904-2.9293 1.474-2.891 3.1256v7.9846c0 2.167.9535 3.4825 2.3505 3.763 1.6118.3266 3.1832-.7152 3.5098-2.327.04-.1974.06-.3983.0593-.5998v-8.9585c.003-1.6474-1.33-2.9852-2.9773-2.9882z" />
    </svg>
  );
}

function IconNotebook({ size = 22, className }: IconProps) {
  return (
    <svg {...strokeProps(size, className)}>
      <path d="M4 4h13a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z" />
      <path d="M8 4v16" />
      <path d="M12 9h4" />
      <path d="M12 13h4" />
    </svg>
  );
}

function IconReport({ size = 22, className }: IconProps) {
  return (
    <svg {...strokeProps(size, className)}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 17v-4" />
      <path d="M12 17v-6" />
      <path d="M15 17v-2" />
    </svg>
  );
}

const BEYOND_DATA = [
  {
    title: "Integrations: GSC + more",
    body: "Connect Google Search Console and more so your agent sees what is actually happening on your site.",
    icons: [
      { name: "Google Search Console", Icon: IconSearchConsole },
      { name: "Google Analytics 4", Icon: IconGoogleAnalytics },
    ],
  },
  {
    title: "Project Context",
    body: "As you use the OpenSEO skills, your agent saves what it learns about your business and how you like to write. No repeating yourself every session.",
    icons: [{ name: "Saved context", Icon: IconNotebook }],
  },
  {
    title: "Agent reports",
    body: "Reading agents output is annoying. Every piece of research your agent does is saved as a beautiful, easy to read report.",
    icons: [{ name: "Agent report", Icon: IconReport }],
    link: {
      label: "See an example report",
      href: "https://app.openseo.so/s/QEZZWxoLl4TpzhKxeiNRGuM_Hj15eUzY",
    },
  },
];

function BeyondDataSection() {
  return (
    <section className="itc-section">
      <Container>
        <div className="itc-narrow">
          <h2 className="itc-display-lg">Beyond data</h2>
          <p className="itc-subhead itc-muted" style={{ margin: "20px 0 0" }}>
            An SEO tool is nothing without quality data. That&apos;s why OpenSEO
            uses{" "}
            <a
              href="https://dataforseo.com/?aff=255379"
              target="_blank"
              rel="noopener noreferrer"
              className="itc-inline-link"
            >
              DataForSEO
            </a>
            . But we also do much more.
          </p>
        </div>

        <div className="itc-bd-cards">
          {BEYOND_DATA.map(({ title, body, icons, link }) => (
            <div key={title} className="itc-card itc-bd-card">
              <div className="itc-bd-icons">
                {icons.map(({ name, Icon }) => (
                  <span key={name} className="itc-agent-icon" title={name}>
                    <Icon aria-hidden="true" />
                  </span>
                ))}
              </div>
              <h3 className="itc-card-title">{title}</h3>
              <p
                className="itc-body-sm itc-muted"
                style={{ margin: "10px 0 0" }}
              >
                {body}
              </p>
              {link && (
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="itc-textlink itc-bd-link"
                >
                  {link.label}{" "}
                  <IconArrowRight size={15} className="itc-arrow" />
                </a>
              )}
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

// ─── Open source ─────────────────────────────────────────────────────

function OpenSourceSection() {
  return (
    <section className="itc-section itc-section-open-source">
      <Container>
        <div className="itc-narrow">
          <h2 className="itc-display-lg">100% open source</h2>
          <p className="itc-subhead itc-muted" style={{ margin: "20px 0 0" }}>
            People should have the option to self-host and customize their
            tools. If you ever hear someone talking about building their own
            tool from scratch, tell them to build on top of OpenSEO.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 24,
            marginTop: 32,
          }}
        >
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="itc-btn itc-btn-secondary"
          >
            <IconGithub size={16} />
            Star on GitHub
          </a>
          <a href="/open-source-seo" className="itc-textlink">
            Why Open Source? <IconArrowRight size={15} className="itc-arrow" />
          </a>
        </div>
      </Container>
    </section>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="itc-footer">
      <Container>
        <div
          style={{
            paddingTop: 64,
            paddingBottom: 40,
            display: "flex",
            flexWrap: "wrap",
            gap: 32,
            alignItems: "flex-end",
            justifyContent: "space-between",
            borderBottom: "1px solid #ebe7e1",
          }}
        >
          <div style={{ maxWidth: 420 }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>
              Stay in the loop
            </p>
            <p className="itc-body-sm itc-muted" style={{ margin: "6px 0 0" }}>
              Product updates, new features, and the occasional
              behind-the-scenes.
            </p>
          </div>
          <div
            className="itc-newsletter"
            style={{ width: "100%", maxWidth: 384 }}
          >
            <NewsletterSignup />
          </div>
        </div>

        <div className="itc-sitefooter" style={{ paddingTop: 40 }}>
          <SiteFooter />
        </div>

        <p
          className="itc-caption itc-subtle"
          style={{ margin: 0, padding: "40px 0 32px" }}
        >
          © 2026 Every App, Inc.
        </p>
      </Container>
    </footer>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

export function LandingPage() {
  return (
    <div className="itc">
      <Hero />
      <McpSection />
      <Testimonial />
      <BeyondDataSection />
      <OpenSourceSection />
      <ProductSection />
      <Footer />
      <a
        href={DISCORD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="itc-discord"
        aria-label="Join the OpenSEO Discord"
      >
        <IconDiscord size={18} />
        <span>Discord</span>
      </a>
    </div>
  );
}
