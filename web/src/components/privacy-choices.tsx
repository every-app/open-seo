import * as React from "react";
import {
  effectivePrivacyChoices,
  hasGlobalPrivacyControl,
  readPrivacyCookie,
  savePrivacyChoices,
  type PrivacyChoices as Choices,
} from "../../../src/shared/privacy-choices";

// The footer's "Your privacy choices" link dispatches this to open the dialog.
const OPEN_PRIVACY_CHOICES_EVENT = "openseo:open-privacy-choices";
const PLAUSIBLE_IGNORE = "plausible_ignore";

// Plausible and OpenAnalytics count visits without cookies for everyone (the
// dialog offers one opt-out for both). The consent-based tracking here is the
// Meta Pixel and Dub's referral cookie on partner links. Each loads where the
// visitor's choice or region allows it; where opt-in is required, visitors
// from a partner link or one of our Meta ads are asked. The footer's dialog
// also holds the app's analytics choice (one shared cookie).
export function PrivacyChoices() {
  const [saved, setSaved] =
    React.useState<ReturnType<typeof readPrivacyCookie>>(null);
  const [optIn, setOptIn] = React.useState<boolean | null>(null);
  const [view, setView] = React.useState<"none" | "partner" | "ad" | "dialog">(
    "none",
  );

  React.useEffect(() => {
    const savedChoices = readPrivacyCookie(document.cookie);
    setSaved(savedChoices);
    if (!hasGlobalPrivacyControl()) {
      if (isPartnerVisit()) {
        if (savedChoices) {
          if (savedChoices.referrals) loadReferralAttribution();
        } else {
          void fetchOptIn().then((required) => {
            setOptIn(required);
            if (required) setView("partner");
            else loadReferralAttribution();
          });
        }
      }
      // Without a saved Meta choice, /js/meta.js applies the region default
      // itself. Only an ad visit, which gets the prompt where opt-in is
      // required, looks up the region here.
      if (
        savedChoices?.advertising === undefined &&
        isMetaAdVisit() &&
        !isPartnerVisit()
      ) {
        void fetchOptIn().then((required) => {
          setOptIn(required);
          if (required) setView("ad");
          else loadMetaPixel();
        });
      } else if (savedChoices?.advertising !== false) {
        loadMetaPixel();
      }
    }

    const open = () => setView("dialog");
    window.addEventListener(OPEN_PRIVACY_CHOICES_EVENT, open);
    return () => window.removeEventListener(OPEN_PRIVACY_CHOICES_EVENT, open);
  }, []);

  // The dialog shows region defaults for choices the visitor hasn't made.
  const needsRegion = saved?.advertising === undefined;
  React.useEffect(() => {
    if (view === "dialog" && needsRegion && optIn === null) {
      void fetchOptIn().then(setOptIn);
    }
  }, [view, needsRegion, optIn]);

  const choices =
    !needsRegion || optIn !== null
      ? effectivePrivacyChoices({
          saved,
          optIn: optIn ?? false,
          globalPrivacyControl: hasGlobalPrivacyControl(),
        })
      : null;

  function save(next: Choices) {
    // A loaded script can't be unloaded; a reload stops it.
    const stopScripts =
      (!next.referrals &&
        document.querySelector("script[data-openseo-dub]") !== null) ||
      (!next.advertising &&
        document.querySelector("script[data-openseo-meta]") !== null) ||
      (localStorage.getItem(PLAUSIBLE_IGNORE) === "true" &&
        document.querySelector("script[data-openseo-openanalytics]") !== null);
    savePrivacyChoices(next);
    setSaved(next);
    setView("none");
    if (next.advertising) loadMetaPixel();
    if (next.referrals) loadReferralAttribution();
    if (stopScripts) location.reload();
  }

  if (!choices || view === "none") return null;

  if (view === "partner") {
    return (
      <Prompt onAnswer={(referrals) => save({ ...choices, referrals })}>
        You came from a partner&apos;s link. Can we keep a 90-day cookie (Dub)
        so they get credit if you sign up?
      </Prompt>
    );
  }

  if (view === "ad") {
    return (
      <Prompt onAnswer={(advertising) => save({ ...choices, advertising })}>
        You came from one of our ads on Facebook or Instagram. Can Meta measure
        whether it led to a sign-up or subscription?
      </Prompt>
    );
  }

  return (
    <Panel className="max-w-md">
      <ChoicesForm
        initial={choices}
        onSave={save}
        onCancel={() => setView("none")}
      />
    </Panel>
  );
}

function ChoicesForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: Choices;
  onSave: (choices: Choices) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = React.useState(initial);
  const [countVisits, setCountVisits] = React.useState(
    () => localStorage.getItem(PLAUSIBLE_IGNORE) !== "true",
  );
  const gpc = hasGlobalPrivacyControl();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        // Plausible's own opt-out: its script skips tracking while this is set,
        // and the root loader skips OpenAnalytics.
        if (countVisits) localStorage.removeItem(PLAUSIBLE_IGNORE);
        else localStorage.setItem(PLAUSIBLE_IGNORE, "true");
        onSave(draft);
      }}
    >
      <p className="font-semibold text-neutral-900">Your privacy choices</p>
      <div className="mt-3 space-y-3">
        <ChoiceRow
          label="Visit counts"
          description="No cookies or IDs saved in your browser (Plausible and OpenAnalytics)."
          checked={countVisits}
          onChange={setCountVisits}
        />
        <ChoiceRow
          label="Product analytics"
          description="Usage analytics and session replays in the app, with all text hidden (PostHog)."
          checked={draft.analytics}
          onChange={(analytics) => setDraft({ ...draft, analytics })}
        />
        <ChoiceRow
          label="Partner referrals"
          description={
            gpc
              ? "Off because your browser sends Global Privacy Control."
              : "A 90-day cookie that credits the partner who sent you (Dub)."
          }
          checked={draft.referrals && !gpc}
          disabled={gpc}
          onChange={(referrals) => setDraft({ ...draft, referrals })}
        />
        <ChoiceRow
          label="Advertising"
          description={
            gpc
              ? "Off because your browser sends Global Privacy Control."
              : "Lets Meta measure which of our ads lead to sign-ups and subscriptions (Meta Pixel)."
          }
          checked={draft.advertising && !gpc}
          disabled={gpc}
          onChange={(advertising) => setDraft({ ...draft, advertising })}
        />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <PanelButton onClick={onCancel}>Cancel</PanelButton>
        <PanelButton type="submit" primary>
          Save
        </PanelButton>
      </div>
    </form>
  );
}

function ChoiceRow(props: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        className="mt-1 size-4 shrink-0"
        checked={props.checked}
        disabled={props.disabled}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span>
        <span className="font-medium text-neutral-900">{props.label}</span>
        <span className="block text-neutral-600">{props.description}</span>
      </span>
    </label>
  );
}

// Bottom left on wider screens, clear of the page's centre column and the
// Discord button; full width on phones.
function Panel(props: { className: string; children: React.ReactNode }) {
  return (
    <div
      role="dialog"
      aria-label="Privacy choices"
      className={`fixed inset-x-4 bottom-4 z-50 rounded-lg border border-neutral-300 bg-white p-4 text-sm text-neutral-700 shadow-lg sm:right-auto ${props.className}`}
    >
      {props.children}
    </div>
  );
}

function Prompt(props: {
  children: React.ReactNode;
  onAnswer: (allow: boolean) => void;
}) {
  return (
    <Panel className="max-w-sm">
      <p>{props.children}</p>
      <div className="mt-3 flex justify-end gap-2">
        <PanelButton onClick={() => props.onAnswer(false)}>
          No thanks
        </PanelButton>
        <PanelButton onClick={() => props.onAnswer(true)}>Allow</PanelButton>
      </div>
    </Panel>
  );
}

// A prompt's two answers share one style, so declining is as easy as
// agreeing. The dialog's Save is only slightly stronger.
function PanelButton(props: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  primary?: boolean;
}) {
  return (
    <button
      type={props.type ?? "button"}
      onClick={props.onClick}
      className={
        props.primary
          ? "min-h-9 rounded-md border border-neutral-300 bg-neutral-100 px-3 font-semibold text-neutral-900 hover:bg-neutral-200"
          : "min-h-9 rounded-md border border-neutral-300 px-3 font-medium text-neutral-900 hover:bg-neutral-100"
      }
    >
      {props.children}
    </button>
  );
}

export function PrivacyChoicesLink() {
  return (
    <button
      type="button"
      className="text-left"
      onClick={() =>
        window.dispatchEvent(new Event(OPEN_PRIVACY_CHOICES_EVENT))
      }
    >
      Your privacy choices
    </button>
  );
}

const isPartnerVisit = () => {
  const params = new URLSearchParams(location.search);
  return params.has("dub_id") || params.has("via");
};

// A click on one of our Facebook or Instagram ads: Meta adds ?fbclid=, and
// the ads' UTM tags name the platform.
const META_AD_SOURCES = new Set(["facebook", "instagram", "meta", "fb", "ig"]);
const isMetaAdVisit = () => {
  const params = new URLSearchParams(location.search);
  const source = params.get("utm_source")?.toLowerCase() ?? "";
  return params.has("fbclid") || META_AD_SOURCES.has(source);
};

// Opt-in is required in the EEA, UK, Switzerland and unknown locations
// (Cloudflare's CF-IPCountry, read by /api/privacy-region). The page is
// prerendered, so the browser asks. A failed lookup counts as opt-in.
async function fetchOptIn(): Promise<boolean> {
  try {
    const data: unknown = await (await fetch("/api/privacy-region")).json();
    return !(data instanceof Object && Reflect.get(data, "optIn") === false);
  } catch {
    return true;
  }
}

// The Meta Pixel, served first-party by routes/js/meta[.]js.ts. Its `_fbp` and
// `_fbc` cookies on `.openseo.so` let the app attribute a signup to an ad.
function loadMetaPixel() {
  if (document.querySelector("script[data-openseo-meta]")) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = "/js/meta.js";
  script.dataset.openseoMeta = "";
  // The route serves an empty script where the pixel isn't allowed. Dropping
  // that tag keeps a save from reloading the page to stop a pixel that never
  // ran, and lets an Allow on this page request the pixel again.
  script.onload = () => {
    if (!("fbq" in window)) script.remove();
  };
  document.head.appendChild(script);
}

// Dub partner links land here with ?dub_id= (and ?via=). Dub's script stores
// the click id as a `dub_id` cookie on `.openseo.so` so the app at
// app.openseo.so can attribute the signup. Only those visits need it.
function loadReferralAttribution() {
  if (!isPartnerVisit()) return;
  if (document.querySelector("script[data-openseo-dub]")) return;
  const script = document.createElement("script");
  script.src = "https://www.dubcdn.com/analytics/script.js";
  script.dataset.openseoDub = "";
  script.dataset.domains = JSON.stringify({ refer: "links.openseo.so" });
  script.dataset.cookieOptions = JSON.stringify({ domain: ".openseo.so" });
  document.head.appendChild(script);
}
