import L from "leaflet";
import leafletCss from "leaflet/dist/leaflet.css?inline";
import googleMapsLogo from "../client/features/local-seo/google-maps-logo.svg";
import {
  readMapGrant,
  REPORT_MAP_HEIGHT,
  REPORT_MAP_PADDING,
} from "../shared/report-map";

// The rank-grid report widget: turns a declarative block a skill wrote into
// the Maps grid, the way local rank trackers draw it. The view opens fitted to
// the grid; readers can zoom and pan within the area the map grant covers, and
// a button brings the fitted view back. This bundle is the only script a
// report may run (see src/shared/report-sandbox.ts), so
// it reads data from the page and never evaluates anything found there.
//
// The block it looks for:
//
//   <figure data-widget="rank-grid">
//     <script type="application/json">{ ...RankGridConfig }</script>
//     <svg>…static fallback…</svg>
//     <figcaption>…</figcaption>
//   </figure>
//
// The fallback stays in the document (hidden once the map is up) so an export
// or a viewer without scripts still shows the grid. So does a document served
// without a map grant (no Google Maps key on this deployment, or a grid too
// big to be one): there is no map to draw it on.

type GridPoint = {
  row: number;
  col: number;
  lat: number;
  lng: number;
  rank: number | null;
  top?: string | null;
};

type GridKeyword = { keyword: string; points: GridPoint[] };

type RankGridConfig = {
  spacingKm?: number;
  keywords: GridKeyword[];
};

const ALL = "__all__";
const NOT_FOUND_VALUE = 21;

const STYLE = `
.osw{margin:0 0 30px}
.osw-bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px;font-size:14px}
.osw-bar:empty{display:none}
.osw-bar label{display:inline-flex;align-items:center;gap:6px;color:#454545}
.osw-bar select{font:inherit;font-size:14px;padding:5px 9px;border:1px solid #dcdcdc;border-radius:6px;background:#fff;color:#0a0a0a}
.osw-map{height:${REPORT_MAP_HEIGHT}px;max-height:70vh;border:1px solid #ebebeb;border-radius:8px;background:#f2f4f3}
.osw-legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;color:#454545;margin-top:8px}
.osw-sw{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:5px;vertical-align:-1px}
.osw-pin{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font:700 13px ui-monospace,Menlo,monospace;color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:pointer}
.osw-pin.dec{font-size:12px}
.osw-pin.home{box-shadow:0 0 0 3px #fff,0 0 0 5px #0a0a0a,0 1px 4px rgba(0,0,0,.35)}
.osw-pop b{font-weight:600}
.osw-pop table{border-collapse:collapse;width:auto;min-width:0;font-size:13px;margin-top:6px}
.osw-pop td{padding:3px 10px 3px 0;border:0;vertical-align:top;color:#0a0a0a}
.osw-pop td:first-child{color:#454545}
.osw-pop td:nth-child(2){font-family:ui-monospace,Menlo,monospace;font-weight:600;white-space:nowrap}
.osw-pop tr+tr td{border-top:1px solid #ebebeb}
.osw .leaflet-overlay-pane svg{max-width:none}
.osw .leaflet-div-icon{background:transparent;border:0}
.osw .leaflet-popup-content{margin:12px 14px;font-size:13.5px;line-height:1.45}
.osw .leaflet-container{font-family:inherit}
.osw-logo img{display:block;width:59px;height:18px}
.osw .leaflet-control-attribution{font-size:11px}
.osw-fit button{display:block;height:30px;padding:0 10px;border:0;border-radius:4px;background:#fff;color:#0a0a0a;font-family:inherit;font-size:12px;font-weight:600;line-height:30px;cursor:pointer}
.osw-fit button:hover{background:#f4f4f4}
.osw-fallback{display:none}
@media print{.osw{display:none}.osw-fallback{display:block}}
`;

const BANDS: Array<[max: number, fill: string, ink: string, label: string]> = [
  [3, "#3F9D4E", "#fff", "1–3"],
  [5, "#8BC34A", "#fff", "3–5"],
  [7, "#F2C94C", "#2A1E05", "5–7"],
  [10, "#F28C28", "#fff", "7–10"],
  [15, "#E23B3B", "#fff", "10–15"],
  [20, "#A31515", "#fff", "15–20"],
  [Infinity, "#A3ADB8", "#fff", "20+"],
];

function band(value: number) {
  return BANDS.find(([max]) => value <= max) ?? BANDS[BANDS.length - 1];
}

function formatValue(value: number): string {
  if (value > 20) return "20+";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function parseConfig(raw: string): RankGridConfig | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data)) return null;
  const cfg = data;
  if (!Array.isArray(cfg.keywords) || cfg.keywords.length === 0) return null;
  const keywords: GridKeyword[] = [];
  for (const kw of cfg.keywords) {
    if (
      !isRecord(kw) ||
      typeof kw.keyword !== "string" ||
      !Array.isArray(kw.points)
    )
      return null;
    const points: GridPoint[] = [];
    for (const pt of kw.points) {
      if (
        !isRecord(pt) ||
        !isFiniteNumber(pt.row) ||
        !isFiniteNumber(pt.col) ||
        !isFiniteNumber(pt.lat) ||
        !isFiniteNumber(pt.lng)
      )
        return null;
      points.push({
        row: pt.row,
        col: pt.col,
        lat: pt.lat,
        lng: pt.lng,
        rank: isFiniteNumber(pt.rank) ? pt.rank : null,
        top: typeof pt.top === "string" ? pt.top : null,
      });
    }
    keywords.push({ keyword: kw.keyword, points });
  }
  return {
    spacingKm: isFiniteNumber(cfg.spacingKm) ? cfg.spacingKm : undefined,
    keywords,
  };
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function pointKey(p: GridPoint) {
  return `${p.row},${p.col}`;
}

// Google requires its logo on the map and the copyright line for whatever is
// on screen, refreshed as the map moves.
function addGoogleAttribution(map: L.Map, grant: string) {
  const Logo = L.Control.extend({
    onAdd: () => {
      const box = el("div", "osw-logo");
      const img = el("img");
      // oxlint-disable-next-line typescript-eslint/no-unsafe-assignment -- the lint program excludes this browser bundle; tsconfig.report-widgets.json types the import
      img.src = googleMapsLogo;
      img.alt = "Google Maps";
      box.appendChild(img);
      return box;
    },
  });
  new Logo({ position: "bottomleft" }).addTo(map);

  let shown = "";
  const refresh = () => {
    const bounds = map.getBounds();
    const query = new URLSearchParams({
      zoom: String(Math.round(map.getZoom())),
      north: String(Math.min(85.05, bounds.getNorth())),
      south: String(Math.max(-85.05, bounds.getSouth())),
      east: String(map.wrapLatLng(bounds.getNorthEast()).lng),
      west: String(map.wrapLatLng(bounds.getSouthWest()).lng),
    });
    void fetch(`/report-map/${grant}/copyright?${query}`)
      .then((response) => response.json())
      .catch(() => null)
      .then((data: unknown) => {
        const text =
          isRecord(data) && typeof data.copyright === "string"
            ? data.copyright
            : "Map data ©Google";
        if (text === shown) return;
        if (shown) map.attributionControl.removeAttribution(shown);
        map.attributionControl.addAttribution(text);
        shown = text;
      });
  };
  map.on("moveend", refresh);
  refresh();
}

// A button under the zoom control that brings back the fitted view.
function addFitControl(map: L.Map, fit: () => void) {
  const FitControl = L.Control.extend({
    onAdd: () => {
      const bar = el("div", "leaflet-bar osw-fit");
      const button = el("button", undefined, "Fit grid");
      button.type = "button";
      button.title = "Zoom to the whole grid";
      L.DomEvent.disableClickPropagation(bar);
      button.addEventListener("click", fit);
      bar.appendChild(button);
      return bar;
    },
  });
  new FitControl({ position: "topleft" }).addTo(map);
}

function render(figure: HTMLElement, cfg: RankGridConfig, grant: string) {
  // The proxy only serves tiles at the grant's zooms, in and just around its
  // area, so the map's zoom and panning stay inside both.
  const granted = readMapGrant(grant);
  if (!granted) return;
  const wrap = el("div", "osw");
  const bar = el("div", "osw-bar");
  const mapEl = el("div", "osw-map");
  const legend = el("div", "osw-legend");
  wrap.append(bar, mapEl, legend);

  const fallback = figure.querySelector("svg");
  const caption = figure.querySelector("figcaption");
  if (caption) figure.insertBefore(wrap, caption);
  else figure.appendChild(wrap);
  // Print gets the drawing back: tiles may not have loaded when the print
  // dialog snapshots the page, and the drawing is what a PDF should carry.
  if (fallback) fallback.classList.add("osw-fallback");

  // Every distinct point across keywords, keyed by grid cell.
  const cells = new Map<string, GridPoint>();
  for (const k of cfg.keywords)
    for (const p of k.points)
      if (!cells.has(pointKey(p))) cells.set(pointKey(p), p);
  const points = [...cells.values()];
  if (points.length === 0) return;

  const rows = points.map((p) => p.row);
  const cols = points.map((p) => p.col);
  const midRow = (Math.min(...rows) + Math.max(...rows)) / 2;
  const midCol = (Math.min(...cols) + Math.max(...cols)) / 2;
  const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));

  // A keyword with no entry at a point had its search fail there (the skill
  // leaves it out), so it counts toward nothing rather than as a miss.
  const valueAt = (p: GridPoint, selected: string): number | null => {
    const ranks = cfg.keywords
      .filter((k) => selected === ALL || k.keyword === selected)
      .flatMap((k) => k.points.filter((q) => pointKey(q) === pointKey(p)))
      .map((q) => q.rank ?? NOT_FOUND_VALUE);
    if (ranks.length === 0) return null;
    return ranks.reduce((s, r) => s + r, 0) / ranks.length;
  };

  const { area } = granted;
  const map = L.map(mapEl, {
    minZoom: granted.minZoom,
    maxZoom: granted.maxZoom,
    // Panning stops at the granted area: there are no tiles past it.
    maxBounds: [
      [area.south, area.west],
      [area.north, area.east],
    ],
    maxBoundsViscosity: 1,
    boxZoom: false,
    // The wheel scrolls the report until the reader clicks into the map.
    scrollWheelZoom: false,
    attributionControl: true,
  });
  map.attributionControl.setPrefix(false);
  map.on("focus", () => map.scrollWheelZoom.enable());
  map.on("blur", () => map.scrollWheelZoom.disable());
  // The whole grid in the middle of the map with room around it. Refit when
  // the map's size changes, so a narrow column never clips the outer points.
  const fit = (animate = false) =>
    map.fitBounds(bounds, {
      padding: [REPORT_MAP_PADDING, REPORT_MAP_PADDING],
      animate,
    });
  fit();
  new ResizeObserver(() => {
    map.invalidateSize({ animate: false });
    fit();
  }).observe(mapEl);
  addFitControl(map, () => fit(true));
  L.tileLayer(`/report-map/${grant}/{z}/{x}/{y}`).addTo(map);
  addGoogleAttribution(map, grant);

  L.rectangle(bounds, {
    color: "#17202a",
    weight: 1,
    dashArray: "4 4",
    fill: false,
    opacity: 0.55,
    interactive: false,
  }).addTo(map);

  const markers: L.Marker[] = [];
  const draw = (selected: string) => {
    for (const m of markers) m.remove();
    markers.length = 0;
    for (const p of points) {
      const v = valueAt(p, selected);
      if (v === null) continue;
      const [, fill, ink] = band(v);
      const isHome = p.row === midRow && p.col === midCol;
      const decimal = selected === ALL && cfg.keywords.length > 1;
      const icon = L.divIcon({
        className: "leaflet-div-icon",
        html: `<div class="osw-pin${decimal ? " dec" : ""}${isHome ? " home" : ""}" style="background:${fill};color:${ink}">${formatValue(v)}</div>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      const marker = L.marker([p.lat, p.lng], { icon, keyboard: true }).addTo(
        map,
      );
      const pop = el("div", "osw-pop");
      const head = el(
        "b",
        undefined,
        isHome ? "Storefront" : `Point ${p.row + 1},${p.col + 1}`,
      );
      const coords = el(
        "span",
        undefined,
        ` · ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`,
      );
      const table = el("table");
      for (const k of cfg.keywords) {
        const q = k.points.find((c) => pointKey(c) === pointKey(p));
        const tr = el("tr");
        tr.append(
          el("td", undefined, k.keyword),
          el(
            "td",
            undefined,
            !q ? "search failed" : q.rank == null ? "not found" : `#${q.rank}`,
          ),
          el("td", undefined, q?.top ? `#1 ${q.top}` : ""),
        );
        table.appendChild(tr);
      }
      pop.append(head, coords, table);
      marker.bindPopup(pop, { maxWidth: 320 });
      markers.push(marker);
    }
  };

  if (cfg.keywords.length > 1) {
    const label = el("label", undefined, "Keywords ");
    const select = el("select");
    select.append(new Option("All keywords (avg. position)", ALL));
    for (const k of cfg.keywords)
      select.append(new Option(k.keyword, k.keyword));
    select.addEventListener("change", () => draw(select.value));
    label.appendChild(select);
    bar.appendChild(label);
  }

  for (const [, fill, , label] of BANDS) {
    const item = el("span");
    const sw = el("i", "osw-sw");
    sw.style.background = fill;
    item.append(sw, document.createTextNode(label));
    legend.appendChild(item);
  }
  const hint = el(
    "span",
    undefined,
    cfg.spacingKm
      ? `${cfg.spacingKm} km between points · ring marks the storefront`
      : "ring marks the storefront",
  );
  legend.appendChild(hint);

  draw(cfg.keywords.length > 1 ? ALL : cfg.keywords[0].keyword);
}

// The server signs one grant per grid, its area centered on the grid. Grids
// close together can each sit inside the other's area, so the one centered
// nearest this grid is the one signed for it.
function grantFor(cfg: RankGridConfig, grants: string[]) {
  const points = cfg.keywords.flatMap((k) => k.points);
  if (points.length === 0) return undefined;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  let best: { grant: string; distance: number } | undefined;
  for (const grant of grants) {
    const area = readMapGrant(grant)?.area;
    if (
      !area ||
      area.south > south ||
      area.north < north ||
      area.west > west ||
      area.east < east
    )
      continue;
    const distance =
      Math.abs(area.south + area.north - south - north) +
      Math.abs(area.west + area.east - west - east);
    if (!best || distance < best.distance) best = { grant, distance };
  }
  return best?.grant;
}

// The tag is `defer`, so the document is parsed by now, and currentScript is
// still this tag.
function boot() {
  const script = document.currentScript;
  const grants =
    script instanceof HTMLScriptElement
      ? (script.dataset.mapGrants ?? "").split(" ").filter(Boolean)
      : [];
  if (grants.length === 0) return;
  const figures = document.querySelectorAll<HTMLElement>(
    'figure[data-widget="rank-grid"]',
  );
  if (figures.length === 0) return;
  const style = document.createElement("style");
  style.textContent = leafletCss + STYLE;
  document.head.appendChild(style);
  for (const figure of figures) {
    const data = figure.querySelector('script[type="application/json"]');
    const cfg = data?.textContent ? parseConfig(data.textContent) : null;
    const grant = cfg ? grantFor(cfg, grants) : undefined;
    if (!cfg || !grant) continue;
    render(figure, cfg, grant);
  }
}

boot();
