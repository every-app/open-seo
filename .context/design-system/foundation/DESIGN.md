# ByteDesk Shared Design Foundation

This document is the base layer inherited by every ByteDesk application. The family
shares one value layer, `foundation/tokens.json`, holding the ground, brand, type, and
semantic values every product inherits. Density, visual genre, and product identity
remain per-app decisions. This repository is the sole upstream design authority for the
family. No consumer product, including bytedesk.ai or Workforce, is an alternate source
of brand, token, asset, or visual-system truth; a consumer reveals a need and provides
evidence, and the canonical decision still lands here first.

## 1. Source-of-truth order

Every consumer reads, in order:

1. `foundation/DESIGN.md`, this document;
2. `apps/<slug>/DESIGN.md`, with `apps/<slug>/PRODUCT.md` beside it;
3. its own root `DESIGN.md`, which holds only named exceptions and local references.

The machine-readable form of each app is `apps/<slug>/app.json`. The build generates
every adapter from `foundation/tokens.json` and those manifests.

A local exception names the inherited rule it changes and explains why. Copying inherited
prose into a consumer is not an override; it is drift. A consumer's shipped page,
screenshot, or local asset is not precedent by itself: propose the decision here, place
it at the narrowest owning layer, review it, and then update consumers.

## 2. Token-first implementation

Visual values route through the consumer's declared token root. Components do not invent
colors, type sizes, spacing, radii, shadows, or motion values. An app's DESIGN.md
identifies its actual token source and enforcement command. `foundation/tokens.json` is
the only hand-edited token file; a consumer's token root **maps to** its values rather
than restating them as literals. Products differentiate through their declared accent
and app-scoped decisions, not by forking the foundation. A product needing a different
foundation value lands the change here first (section 9).

### Product accent

An accent is declared once, in `app.json`, with a mode of `own`, `inherits`, `none`, or
`undecided`. The build generates the token, the `[data-bd-product]` scope, and every
adapter from that declaration. An accent is distinct from every other by the S1 rule
(OKLCH hue at least 20 degrees away, or 10 degrees with lightness differing by 0.08),
holds 4.5:1 on the base ground, and is never a semantic status colour.

## 3. Product identity is explicit

Shared brand assets live under `foundation/brand/`; product identity lives under
`apps/<slug>/brand/` and `apps/<slug>/DESIGN.md`. Do not substitute one product's icon,
wordmark, palette, or component rules for another's. Master marks, lockups, and product
marks originate here; consumers use cataloged exports and never hold the only master.

## 4. ByteDesk visual language

**Creative north star: Black Glass + Optical Layering.** ByteDesk application shells
feel technical, agentic, deliberate, and alive without becoming science-fiction
decoration. The family composition is an atmospheric canvas carrying one optically
elevated command shell; inside it, tone, hairlines, inset wells, and restrained top-light
establish hierarchy. Do not flatten large-screen products into edge-to-edge panel
tiling, and do not put a frosted card around every field.

The approved visual record lives at `foundation/mockups/`: the primary dark reference
governs material character, the parity board and light study govern theme intent.
Written rules and tokens remain normative when generated pixels are ambiguous, and a
reference image never authorizes fake data or behavior.

### Family DNA

- **Material:** near-opaque graphite or pearl glass, a fine perimeter, subtle inner
  top-edge light, and a broad low-opacity ambient shadow. Blur supports separation; it
  never reduces text contrast or turns the canvas into haze.
- **Neutrals:** no neutral in the system is `#000` or `#fff`. Every neutral is tinted
  toward the family hue; light raised and overlay surfaces are a barely tinted pearl.
- **Layering:** canvas, then floating shell, then inset region, then raised or overlay
  surface. Most content stays on the shell plane; raised levels explain only selection,
  expansion, menus, decisions, dialogs, drag state, or other real hierarchy.
- **Energy:** electric blue carries interaction, focus, selection, agent activity, and
  technical energy. ByteDesk orange is a restrained identity spark for handoff,
  attention, and rare high-value emphasis. Product accents identify products; they do
  not replace interaction blue, family orange, or semantic status.
- **Typography:** IBM Plex Sans for every interface surface: chrome, labels, paths,
  versions, identifiers, timestamps, and numeric columns, which use tabular figures. One
  monospace token, `font.mono`, survives strictly for machine-text content: terminal
  emulation, log viewers, code blocks, and secret reveal. An app that uses it names each
  such surface as a functional exception. No other font family exists in the system.
- **Geometry:** an 8px rhythm, 1px hairlines, restrained 8 to 16px shell radii, and
  strong alignment. Full-screen means a responsive full-screen canvas with a materially
  elevated shell and breathing room, not panels stretched to every edge.
- **Breathing room:** the family's resting floor is `space.6` (16px) between content and
  any edge that contains it, and `space.5` (12px) between stacked elements. Rows, cards,
  panels, list sections, and dialogs sit at or above that floor at rest, in every product.
  This is a floor, not a fixed value: an app may compact below it, but only inside a
  density mode it declares and names, never in the state a product opens in. Both numbers
  are token steps; move to the next step and let composed heights fall out as arithmetic.
- **Motion:** short, interruptible, state-led, with one clear focal event. Ambient glow
  breathes only for real activity. Reduced motion removes parallax, bloom animation, and
  spatial travel while preserving state.

### Exact dark/light parity

Dark and light are both shipping family themes. They are the same interface rendered
through two semantic token sets: identical information architecture, geometry, spacing,
component states, iconography, hierarchy, and behavior. Theme changes may alter ground,
surface translucency, shadow, highlight, glow, and ink values only. A light mockup is
not permission to redesign, simplify, or omit the dark interface. Use
`data-bd-theme="dark|light"` on web roots and the equivalent typed native theme. System
preference may choose the initial value; an explicit user choice persists. Every
component story and approved page mockup demonstrates both themes before adoption.

### Governed dark richness

Dark products expose `data-bd-richness="soft|balanced|rich"` or the equivalent native
setting; `balanced` is the default. Richness adjusts only dark canvas depth, glass
opacity, ambient shadow, and bloom strength. It never changes layout, type, content,
semantic color, focus visibility, or minimum contrast. Light ignores this preference.

### Product personality

Consistency is not sameness. Each app declares its accent, signature icon metaphor,
density, surface and depth calibration, motion temperament, voice, and one domain
composition motif. The machine-readable fields live in `app.json`; the stance lives in
the app's DESIGN.md. The shared shell anatomy, theme parity, accessibility, interaction
blue, restrained orange, and component semantics remain stable. Product marks embody
the product's noun or function through a recognizable object or system metaphor (a brain
for Agent Memory, an aperture for Capture). Marks are dimensional technical objects with
controlled blue energy and an optional orange core, never emoji, mascots, or generic
monoline placeholders. Approval is still required before a concept becomes an identity.

### Storybook and mockup gate

Storybook is the shared visual-contract and accessibility harness for web-renderable
components; it does not make React the authority for other runtimes. Every application
is mocked in HTML, and its component states (both themes, richness, keyboard and focus,
reduced motion, responsive widths, empty, loading, offline, permission, progress,
destructive, partial, failure) exist in Storybook before adoption, which for native
runtimes is gated on explicit approval of the browser mockup.

## 5. Accessible by default

Target WCAG 2.2 AA for shipped user interfaces. Keyboard access, visible focus,
sufficient contrast, and reduced-motion behavior are design requirements. Color is never
the only carrier of state. Motion communicates state or hierarchy; it never blocks it.

## 6. Operational clarity

Interfaces expose the state, consequence, and next action before decoration. Machine
values use stable formatting. Status meanings remain consistent inside a product.

## 7. Asset integrity

Use cataloged assets only. Preserve aspect ratio, clear space, approved color variant,
and accessible labeling. Do not recolor raster marks, trace new vectors from screenshots,
or add untracked logo variants in a consumer. Every asset is registered and
checksum-verified by the validator. Third-party assets require explicit license and
attribution metadata before import.

## 8. Approved artifacts

Only durable, approved work products belong in the repository. Every approved piece
carries a README naming its product, owner, approval state, source, and intended use;
drafts stay in working directories. An accepted brand guide or identity system preserves
the decision trail that produced it: product evidence, concept rounds, rejected
directions with rationale, the selected direction, provenance, approval date, and
supersession history. The guide and the applicable DESIGN.md files are normative;
decision records explain the reasoning and create no rules.

## 9. Change discipline

Design-system changes land here first. Consumers adopt a tagged version. Breaking changes
are called out in `CHANGELOG.md`; silent floating updates are prohibited.

## 10. Generated art

Generated raster art is **exploration**. It answers what a surface should feel like while
the implementation answers what it is. It is never implementation source. It must not
contain logos or identity-critical marks, product copy, fake controls,
invented metrics, functional icons, or rasterized application UI. Interfaces and icons are
built in React/HTML/CSS against the `--bd-*` tokens; a generated screenshot of a screen is
not a screen. When a request asks for the forbidden thing, name the part that is out of
bounds and offer the form that works (a mockup built against real tokens, or the
cataloged mark) rather than refusing flatly or quietly producing it anyway.

Every generated piece ships **paired with the compliant artifact** it accompanies, and the
pairing says plainly which is which. A dry token-accurate screenshot delivered by itself
reads as a downgrade. The boundary is not a reason to deliver less craft, only a reason
to put the craft where it is allowed to be. **Never read a colour value off generated
art.** Renderers drift hue; a teammate who samples a generated PNG for a token gets the
wrong number. `foundation/tokens.json` is the authority.

### The family holds these constant

A ByteDesk piece is recognisable before you know which product it belongs to:

- the ground is the base dark, unlifted: no haze, no fog, no frosted wash over the field;
- **exactly one element is lit.** Every other form stays unlit material;
- the accent is an edge-light, a seam, or a contained glow, never a fill or the subject;
- surfaces are matte with a fine even grain: no gloss, no flooding bloom, no flare, no rainbow;
- the composition breathes. Empty ground is structural, not wasted;
- no gradient is ever the subject. A soft wash reads as an unfinished render, not a
  decision.

### The product supplies the idea

Everything above is shared. What must not be shared is the **motif**, the single idea the
piece is about, drawn from what that product actually does. A piece that would work
equally well for another product has failed, however handsome it is. Swapping the accent
hex is not personalisation; the geometry itself carries the product. Each app names its
motif in `app.json` and expands on it under *Generated art* in its DESIGN.md, and a piece
is judged against that motif before anything else. Restraint scores govern the product
surface, not the marketing surface: a console scoring decoration low is a rule about the
operator's screen, not about the launch page.

### Where it lives

Approved and exploratory pieces alike live at `apps/<slug>/mockups/<surface>-v<n>/`, and
the family record at `foundation/mockups/`. Each directory carries a README recording
owner, status, dimensions, SHA-256, the generating tool and its prompt location, and, for
anything not approved, the words that say so. Every file is registered and
checksum-verified by the validator. A revision that materially changes the direction
gets a new sibling version directory. Superseded rounds are kept with the reason they
were superseded, so a later contributor sees what was tried, not only what survived.
