// Served verbatim at /styles.css. Kept as a module string so the Worker stays
// dependency-free. Palette + type mirror the OpenSEO marketing site (web/):
// a warm "cream" canvas, ink text, one orange accent, Inter, hairline borders,
// small radii, no shadows.
export const STYLESHEET = `
:root {
  --canvas: #f5f1ec;
  --surface: #ffffff;
  --surface-2: #ebe7e1;
  --ink: #111111;
  --ink-muted: #626260;
  --ink-subtle: #7b7b78;
  --hairline: #d8d1c8;
  --hairline-soft: #ebe7e1;
  --orange: #ff5600;
  --footer-bg: #eee8de;
  --critical: #d23b1f;
  --warning: #b26a00;
  --info: #6b7280;
  --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  background: var(--canvas);
  color: var(--ink);
  font-family: var(--sans);
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

a { color: var(--ink); text-decoration: none; }
a:hover { text-decoration: underline; text-underline-offset: 3px; }

.wrap, .main, .panel, .nav, .foot-inner { max-width: 820px; margin: 0 auto; padding-left: 24px; padding-right: 24px; }

/* ── nav ── */
.nav {
  display: flex;
  align-items: center;
  gap: 20px;
  padding-top: 20px;
  padding-bottom: 20px;
}
.brand {
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ink);
  font-size: 17px;
}
.brand:hover { text-decoration: none; }
.nav-link { color: var(--ink-muted); font-weight: 500; margin-left: auto; font-size: 15px; }
.nav-link:hover { color: var(--ink); }

/* ── content ── */
.main { padding-top: 8px; padding-bottom: 48px; }
.main h1 {
  font-size: clamp(30px, 4.6vw, 46px);
  font-weight: 500;
  line-height: 1.1;
  letter-spacing: -0.025em;
  margin: 12px 0 18px;
  text-wrap: balance;
}
.main h2 {
  font-size: 24px; font-weight: 500; letter-spacing: -0.017em;
  margin: 40px 0 12px;
}
.main h3 { font-size: 19px; font-weight: 500; margin: 26px 0 8px; }
.main h4 { font-size: 16px; font-weight: 600; margin: 20px 0 6px; }
.main p { color: #2c2c2b; margin: 0 0 16px; }
.lede { font-size: 19px; line-height: 1.45; letter-spacing: -0.006em; color: var(--ink); }
.main a { color: var(--ink); text-decoration: underline; text-decoration-color: var(--hairline); text-underline-offset: 3px; }
.main a:hover { text-decoration-color: var(--ink); }
.main img {
  max-width: 100%; border-radius: 10px; border: 1px solid var(--hairline);
  display: block; margin: 20px 0; background: var(--surface);
}
.main code {
  font-family: var(--mono); font-size: 13.5px;
  background: var(--surface-2); padding: 2px 6px; border-radius: 5px;
}
.main ul, .main ol { color: #2c2c2b; padding-left: 20px; }
.main li { margin: 4px 0; }
.next { margin-top: 8px; }
.next a { font-weight: 500; }

/* ── test panel ── */
.panel {
  margin-top: 8px;
  margin-bottom: 32px;
  background: var(--surface);
  border: 1px solid var(--hairline);
  border-radius: 12px;
  padding: 18px 20px;
}
.panel-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.panel-kicker {
  text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px;
  font-weight: 600; color: var(--ink-subtle);
}
.panel-cat {
  margin-left: auto; font-size: 12px; color: var(--ink-subtle);
  font-family: var(--mono);
}
.panel-summary { margin: 10px 0 0; font-size: 15px; color: var(--ink); }
.panel-lesson { margin: 6px 0 0; font-size: 14px; color: var(--ink-muted); }
.panel-chips { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.chips-label { font-size: 12px; color: var(--ink-subtle); font-weight: 500; margin-right: 2px; }

.chip {
  display: inline-flex; align-items: center; gap: 7px;
  font-size: 12.5px; font-weight: 500; color: var(--ink);
  padding: 3px 11px 3px 9px; border-radius: 999px;
  background: var(--canvas); border: 1px solid var(--hairline);
}
.chip::before {
  content: ""; width: 7px; height: 7px; border-radius: 50%; flex: none;
  background: var(--info);
}
.chip-critical::before { background: var(--critical); }
.chip-warning::before { background: var(--warning); }
.chip-info::before { background: var(--info); }
.chip-clean { color: var(--ink-muted); }
.chip-clean::before { background: #3a9d5d; }

/* ── hero + home bits ── */
.hero { padding: 20px 0 4px; }
.stat-row { display: flex; gap: 40px; flex-wrap: wrap; margin: 26px 0 8px; }
.stat b { font-size: 30px; font-weight: 500; letter-spacing: -0.02em; display: block; line-height: 1.1; }
.stat span { color: var(--ink-muted); font-size: 14px; }
.callout {
  background: var(--surface); border: 1px solid var(--hairline);
  border-radius: 12px; padding: 16px 18px; margin: 24px 0;
}
.callout p { margin: 0; color: #2c2c2b; }

/* ── catalog index (no cards) ── */
.index-group { margin: 40px 0; }
.index-group > h2 { margin-bottom: 4px; }
.index-list { margin-top: 8px; border-top: 1px solid var(--hairline); }
.index-list .index-row {
  display: grid;
  grid-template-columns: minmax(160px, 240px) 1fr auto;
  gap: 20px;
  align-items: baseline;
  padding: 14px 12px;
  margin: 0 -12px;
  border-radius: 8px;
  border-bottom: 1px solid var(--hairline);
  color: var(--ink);
  text-decoration: none;
}
.index-list .index-row:hover {
  background: var(--surface-2);
  border-bottom-color: transparent;
}
.index-list .index-row:hover .row-name {
  text-decoration: underline;
  text-decoration-color: var(--ink);
  text-underline-offset: 3px;
}
.row-name { font-weight: 500; }
.row-sum { color: var(--ink-muted); font-size: 14.5px; }
.row-sev { display: inline-flex; gap: 5px; align-items: center; padding-top: 4px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
.dot-critical { background: var(--critical); }
.dot-warning { background: var(--warning); }
.dot-info { background: var(--info); }
.legend { display: inline-flex; gap: 14px; flex-wrap: wrap; align-items: center; color: var(--ink-muted); font-size: 14px; }
.legend span { display: inline-flex; gap: 6px; align-items: center; }
@media (max-width: 640px) {
  .index-row { grid-template-columns: 1fr auto; }
  .row-sum { grid-column: 1 / -1; }
}

/* ── footer + OpenSEO badge ── */
/* The band fills to the bottom of the page (no body padding beneath it). Extra
   bottom padding keeps the footer text clear of the fixed badge, which floats
   in the empty band space below the row. */
.foot { background: var(--footer-bg); border-top: 1px solid var(--hairline); margin-top: 64px; }
.foot-inner {
  padding: 26px 24px 76px; color: var(--ink-muted); font-size: 14px;
  display: flex; justify-content: space-between; gap: 8px 24px; flex-wrap: wrap;
}
.foot-inner a { color: var(--ink-muted); }
.foot-inner a:hover { color: var(--ink); }
.foot-links { display: flex; gap: 18px; }

.openseo-badge {
  position: fixed; right: 20px; bottom: 20px; z-index: 50;
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--ink); color: #ffffff;
  border-radius: 999px; padding: 11px 17px;
  font-size: 14px; font-weight: 500;
}
.openseo-badge:hover { background: #000000; text-decoration: none; }
.openseo-badge strong { font-weight: 600; }
.openseo-mark {
  width: 22px; height: 24px; flex: none;
  background: url("/openseo-logo.png") center / contain no-repeat;
  /* The source logo is a silver tree on transparent; render it white so it
     reads on the dark pill with no backing chip. */
  filter: brightness(0) invert(1);
}
@media (max-width: 640px) {
  .openseo-badge .badge-label { display: none; }
  .openseo-badge { padding: 10px 12px; }
}
`;
