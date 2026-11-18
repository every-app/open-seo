/**
 * /start/<angle>: the landing page for our Meta ads. Nearly every visitor is on
 * a phone inside Instagram's or Facebook's browser, where the first screen is
 * about 390 × 664. The ad's headline, one product shot, the Google button and
 * proof all fit inside it, and nothing else on the page leads away.
 */

import { type RefObject, useEffect, useRef, useState } from "react";
import { GABE_TESTIMONIAL } from "@/components/campaign-pages";
import { SIGNUP_URL, TESTIMONIALS } from "@/components/landing-page";
import { MoneyBackGuarantee } from "@/components/money-back-guarantee";
import type { StartAngle } from "@/lib/start-angles";

// The app's sign-up page reads `method`: Google goes straight to Google's
// account picker, and email opens the email form.
const GOOGLE_SIGNUP_URL = `${SIGNUP_URL}?method=google`;
const EMAIL_SIGNUP_URL = `${SIGNUP_URL}?method=email`;

type Headline = { lead: string; underlined: string; sub: string };

export const START_HEADLINES: Record<StartAngle, Headline> = {
  claude: {
    lead: "Let Claude do your",
    underlined: "SEO.",
    sub: "Live keyword, ranking and Search Console data for Claude. Set up in 2 minutes.",
  },
  "open-source": {
    lead: "The open‑source",
    underlined: "SEO tool.",
    sub: "Keyword research, rank tracking and site audits. Host it yourself, or use ours.",
  },
  rank: {
    lead: "See where you rank",
    underlined: "on Google.",
    sub: "Track your keywords on mobile and desktop, in the places your customers search.",
  },
  semrush: {
    lead: "A $10 Semrush",
    underlined: "alternative.",
    sub: "Keyword research, competitors, backlinks and rank tracking. Pay for what you use.",
  },
  traffic: {
    lead: "Get more traffic",
    underlined: "from Google.",
    sub: "Find the keywords you can win, fix what holds your site back, and track the results.",
  },
};

// A sourdough baking blog's US rankings (November 2026): keywords on page 1
// or 2 that a push could move into the top 3.
const EXAMPLE_KEYWORDS = [
  { keyword: "focaccia", searches: 201_000, position: 11 },
  { keyword: "brioche buns", searches: 60_500, position: 9 },
  { keyword: "sourdough cinnamon rolls", searches: 40_500, position: 12 },
];

const PROOF_AVATARS = [
  "/avatars/fed-avatar.jpg",
  "/avatars/gabe-avatar.jpg",
  "/avatars/samik-avatar.jpg",
];

const QUOTES = [
  GABE_TESTIMONIAL,
  ...TESTIMONIALS.filter((t) => t.name === "Fed"),
];

const FIRST_STEPS = [
  { title: "Continue with Google", body: "No credit card needed." },
  {
    title: "Add your website",
    body: "We start a site audit for you right away.",
  },
  {
    title: "Connect Search Console or Claude",
    body: "See your real Google clicks, or ask Claude what to fix next.",
  },
];

const FAQ = [
  {
    question: "Do I need Claude?",
    answer:
      "No. Everything works in the web app. Claude, ChatGPT and Codex can connect too if you use them.",
  },
  {
    question: "What's in the free trial?",
    answer:
      "The free trial includes $0.50 of usage, and you don't need a credit card to start.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. Cancel from your billing portal whenever you like. Paid plans also come with a 30-day money-back guarantee.",
  },
];

export function StartLandingPage({ angle }: { angle: StartAngle }) {
  const headline = START_HEADLINES[angle];
  const heroCta = useRef<HTMLDivElement>(null);
  const closingCta = useRef<HTMLDivElement>(null);
  const showStickyCta = useStickyCta(heroCta, closingCta);

  return (
    <div className="itc-start">
      <header className="itc-start-bar">
        <span className="itc-start-logo">OpenSEO</span>
        {/* Most people tapping an ad aren't developers, so the badge says who
            backs us. The open-source ad promises an open-source tool, so its
            page shows the repo's stars instead. */}
        <span className="itc-start-badge">
          {angle === "open-source" ? (
            <>
              <IconStar />
              26k+ GitHub stars
            </>
          ) : (
            <>
              <img src="/y-combinator.svg" alt="" width={16} height={16} />
              Backed by Y Combinator
            </>
          )}
        </span>
      </header>

      <section className="itc-start-hero">
        <div className="itc-start-copy">
          <h1 className="itc-start-title">
            <HeadlineText headline={headline} />
          </h1>
          <p className="itc-start-sub">{headline.sub}</p>
        </div>
        <ProductCard />
        <div ref={heroCta} className="itc-start-cta">
          <SignUpButtons />
        </div>
        <p className="itc-start-proof">
          <span className="itc-start-avatars" aria-hidden="true">
            {PROOF_AVATARS.map((src) => (
              <img key={src} src={src} alt="" width={26} height={26} />
            ))}
          </span>
          {/* Recent sign-ups read as momentum. Kept by hand, so check it
              against last week's count when it's updated. */}
          <span>
            <strong>7,000+</strong> people signed up last week
          </span>
        </p>
      </section>

      <section className="itc-start-section itc-start-steps">
        <div className="itc-start-inner">
          <h2 className="itc-start-h2">Your first 5 minutes</h2>
          <ol>
            {FIRST_STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="itc-start-step-number" aria-hidden="true">
                  {index + 1}
                </span>
                <span>
                  <strong>{step.title}</strong>
                  <span>{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="itc-start-section itc-start-quotes">
        <div className="itc-start-inner">
          <h2 className="itc-start-h3">What people say</h2>
          <div className="itc-start-quote-list">
            {QUOTES.map((t) => (
              <figure key={t.name}>
                <blockquote>&ldquo;{t.quote}&rdquo;</blockquote>
                <figcaption>
                  {t.avatarSrc ? (
                    <img src={t.avatarSrc} alt="" width={32} height={32} />
                  ) : null}
                  <span>
                    <strong>{t.name}</strong>
                    <span className="itc-start-quote-role">
                      {" "}
                      · {t.role ?? t.handle}
                    </span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="itc-start-section">
        <div className="itc-start-inner itc-start-columns">
          <div className="itc-start-price">
            <h2 className="itc-start-h2">Starts at $10 a month</h2>
            <p className="itc-start-body">
              $10 of usage is included every month. One site with weekly rank
              tracking and regular research fits inside it.
            </p>
            <div className="itc-start-price-cards">
              <div>
                <span className="itc-start-price-name">OpenSEO</span>
                <span className="itc-start-price-amount">
                  $10<span>/mo</span>
                </span>
                <span className="itc-start-price-note">
                  Every feature, usage included
                </span>
              </div>
              <div className="itc-start-price-muted">
                <span className="itc-start-price-name">Ahrefs Lite</span>
                <span className="itc-start-price-amount">
                  <s>
                    $129<span>/mo</span>
                  </s>
                </span>
                <span className="itc-start-price-note">List price</span>
              </div>
            </div>
            <p className="itc-start-fine">
              <MoneyBackGuarantee />. Cancel anytime.
            </p>
          </div>

          <div className="itc-start-faq">
            <h2 className="itc-start-h3">Questions</h2>
            {FAQ.map((item, index) => (
              <details key={item.question} open={index === 0}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="itc-start-section itc-start-closing">
        <div className="itc-start-inner">
          <h2 className="itc-start-closing-title">
            <HeadlineText headline={headline} />
          </h2>
          <div ref={closingCta} className="itc-start-cta">
            <SignUpButtons />
          </div>
        </div>
      </section>

      <div
        className="itc-start-sticky"
        data-shown={showStickyCta}
        inert={!showStickyCta}
      >
        <GoogleButton />
        <p>Free to start · No credit card</p>
      </div>
    </div>
  );
}

function HeadlineText({ headline }: { headline: Headline }) {
  return (
    <>
      {headline.lead}{" "}
      <span className="itc-underline">{headline.underlined}</span>
    </>
  );
}

/** What an agent connected to OpenSEO answers, on real data. */
function ProductCard() {
  return (
    <div className="itc-start-card">
      <p className="itc-start-card-ask">Which keywords can I win this month?</p>
      <p className="itc-start-card-title">
        {EXAMPLE_KEYWORDS.length} keywords you&apos;re close to winning
      </p>
      <ul>
        {EXAMPLE_KEYWORDS.map((row) => (
          <li key={row.keyword}>
            <span>
              <strong>{row.keyword}</strong>
              <span>{row.searches.toLocaleString("en-US")} searches/mo</span>
            </span>
            <span className="itc-start-card-rank">#{row.position}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SignUpButtons() {
  return (
    <>
      <GoogleButton />
      <p className="itc-start-cta-note">
        No credit card · <a href={EMAIL_SIGNUP_URL}>Sign up with email</a>
      </p>
    </>
  );
}

function GoogleButton() {
  return (
    <a href={GOOGLE_SIGNUP_URL} className="itc-start-google">
      <span className="itc-start-google-mark">
        <IconGoogle />
      </span>
      Continue with Google
    </a>
  );
}

/**
 * The sticky bar shows once the hero's button has scrolled away, and hides
 * again when the closing button comes into view, so there's always exactly
 * one Google button on screen.
 */
function useStickyCta(
  hero: RefObject<HTMLElement | null>,
  closing: RefObject<HTMLElement | null>,
) {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const heroEl = hero.current;
    const closingEl = closing.current;
    if (!heroEl || !closingEl) return;
    let pastHero = false;
    let atClosing = false;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === heroEl) {
          pastHero =
            !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
        } else {
          atClosing = entry.isIntersecting;
        }
      }
      setShown(pastHero && !atClosing);
    });
    observer.observe(heroEl);
    observer.observe(closingEl);
    return () => observer.disconnect();
  }, [hero, closing]);

  return shown;
}

function IconStar() {
  return (
    <svg width={13} height={13} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="var(--orange)"
        d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"
      />
    </svg>
  );
}

function IconGoogle() {
  return (
    <svg width={18} height={18} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  );
}
