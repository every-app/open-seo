/**
 * Canonical marketing landing page.
 *
 * The page uses a soft cream canvas, restrained hairline surfaces, charcoal
 * type, and a single orange emphasis moment around the MCP section.
 */

import { type ReactNode, type SVGProps } from "react";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { SiteFooter } from "@/components/site-footer";
import { appLinks, brand } from "@/lib/brand";
import { featurePages } from "@/lib/feature-pages";
import { freeTools } from "@/lib/free-tools/tool-pages";
import "./landing-page.css";

const SIGNUP_URL = appLinks.signUp;
const appHost = new URL(brand.appUrl).host;

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
        <h1
          className="itc-display-xl itc-hero-title"
          style={{ maxWidth: 1180, margin: "0 auto" }}
        >
          The modern SEO platform for you and your AI agent.
        </h1>
        <p
          className="itc-subhead itc-muted itc-hero-subtitle"
          style={{ maxWidth: 640, margin: "24px auto 0" }}
        >
          Without quality data, AI gives generic advice. {brand.name} is built
          for you and your AI agent to work together on SEO strategy + content
          tailored to your business.
        </p>
        <div className="itc-hero-ctas">
          <div className="itc-hero-cta-group">
            <ArrowCta size="lg" />
            <p className="itc-hero-cta-note">Free to start</p>
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
  return (
    <video
      style={{ width: "100%" }}
      width={1280}
      height={966}
      poster="/demo-poster.webp"
      muted
      loop
      autoPlay
      playsInline
      preload="metadata"
      aria-label={`${brand.name} product demo: running keyword research`}
    >
      <source src="/demo.mp4" type="video/mp4" />
      <img
        src="/demo-poster.webp"
        alt={`${brand.name} keyword research dashboard`}
        width={1280}
        height={966}
        loading="lazy"
        decoding="async"
      />
    </video>
  );
}

// One restrained row on the home page; the hub at /tools has the rest.
const FREE_TOOL_LINKS = [
  freeTools["backlink-checker"],
  freeTools["competitor-keyword-finder"],
  freeTools["website-traffic-checker"],
  freeTools["competitor-analysis"],
];

function ProductSection() {
  return (
    <section className="itc-section itc-section-demo">
      <Container>
        <div className="itc-narrow">
          <h2 className="itc-display-lg">See {brand.name} in action</h2>
          <p className="itc-subhead itc-muted" style={{ margin: "20px 0 0" }}>
            Keyword research, competitor analysis, backlinks, rank tracking,
            technical audits, and AI-search visibility, all on real DataForSEO
            data and connected to each other.
          </p>
        </div>

        <div className="itc-mockup" style={{ marginTop: 48 }}>
          <div className="itc-mockup-media" style={{ aspectRatio: "1280/966" }}>
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

        <div className="itc-free-tools-row">
          <p className="itc-body-sm itc-free-tools-label">Try a free tool</p>
          {FREE_TOOL_LINKS.map((tool) => (
            <a key={tool.slug} href={tool.path} className="itc-textlink">
              {tool.name} <IconArrowRight size={15} className="itc-arrow" />
            </a>
          ))}
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

function McpSection() {
  return (
    <section className="itc-mcp-section">
      <Container>
        <div className="itc-mcp-grid">
          <div>
            <p className="itc-eyebrow" style={{ color: "#ff5600" }}>
              Model Context Protocol
            </p>
            <h2 className="itc-display-lg">Get superpowers with the MCP</h2>
            <p className="itc-body-lg itc-muted" style={{ margin: "20px 0 0" }}>
              Give your agent real SEO data instead of guesses. It can research
              keywords, competitors, backlinks, and Google Search Console
              performance, then you can review the work in {brand.name}.
            </p>
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
            <div style={{ marginTop: 32 }}>
              <a href="/features/mcp" className="itc-btn itc-btn-fin">
                Learn about MCP tools
                <IconArrowRight size={16} className="itc-arrow" />
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
              <span className="itc-terminal-label">claude · seoshark mcp</span>
            </div>
            <pre>
              <code>
                <span className="t-orange">›</span> find and cluster keywords
                for <span className="t-bright">example.com</span>
                {"\n\n"}
                <span className="t-dim">
                  ⏺ seoshark.keyword_research(seed: &quot;seo platform&quot;)
                </span>
                {"\n"}
                {"  "}keyword{"                      "}volume{"     "}kd{"\n"}
                {"  "}seo platform{"                 "}
                <span className="t-bright">1,300</span>
                {"      "}
                <span className="t-dim">12</span>
                {"\n"}
                {"  "}seo platform for agencies{"    "}
                <span className="t-bright">720</span>
                {"        "}
                <span className="t-dim">9</span>
                {"\n"}
                {"  "}ai seo assistant{"             "}
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
                <span className="t-bright">{appHost}/keywords</span>
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
          © {new Date().getFullYear()} {brand.name}
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
      <ProductSection />
      <Footer />
    </div>
  );
}
