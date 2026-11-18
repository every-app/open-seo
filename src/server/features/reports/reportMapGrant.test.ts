import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createReportMapGrants,
  grantCoversTile,
  verifyReportMapGrant,
} from "./reportMapGrant";

const reportWithGrid = `<!doctype html><html><body>
<figure data-widget="rank-grid"><script type="application/json">{"version":1,"center":{"lat":40.44,"lng":-79.99},"keywords":[{"keyword":"self storage","points":[{"row":0,"col":0,"lat":40.458,"lng":-80.013,"rank":3},{"row":2,"col":2,"lat":40.422,"lng":-79.967,"rank":null}]}]}</script><svg></svg></figure>
</body></html>`;

// Web-mercator tile at zoom 14 containing a coordinate.
function tileAt(lat: number, lng: number, z = 14) {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  return {
    z,
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor(
      ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
    ),
  };
}

describe("report map grants", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-maps-key");
  });

  it("covers the report's grid and nothing far from it", async () => {
    const [grant] = await createReportMapGrants(reportWithGrid);
    const scope = await verifyReportMapGrant(grant ?? "");

    expect(scope).not.toBeNull();
    if (!scope) return;
    expect(grantCoversTile(tileAt(40.44, -79.99), scope)).toBe(true);
    // Philadelphia, ~400 km east.
    expect(grantCoversTile(tileAt(39.95, -75.16), scope)).toBe(false);
  });

  it("stops a few zooms past the fitted view", async () => {
    const [grant] = await createReportMapGrants(reportWithGrid);
    const scope = await verifyReportMapGrant(grant ?? "");

    expect(scope).not.toBeNull();
    if (!scope) return;
    // The grid is ~4 km across, so it fits around zoom 13 and building level
    // is out of reach.
    expect(grantCoversTile(tileAt(40.44, -79.99, 16), scope)).toBe(true);
    expect(grantCoversTile(tileAt(40.44, -79.99, 18), scope)).toBe(false);
  });

  it("gives each grid its own grant, zoomable to that grid", async () => {
    // A second location ~35 km north: one grant sized to both would stop
    // every map zoomed out far enough to show the pair.
    const twoLocations = reportWithGrid.replace(
      "</body>",
      reportWithGrid
        .slice(
          reportWithGrid.indexOf("<figure"),
          reportWithGrid.indexOf("</body>"),
        )
        .replaceAll("40.4", "40.7") + "</body>",
    );
    const grants = await createReportMapGrants(twoLocations);
    const scopes = await Promise.all(grants.map(verifyReportMapGrant));

    expect(scopes).toHaveLength(2);
    const [pittsburgh, north] = scopes;
    if (!pittsburgh || !north) throw new Error("grant did not verify");
    expect(grantCoversTile(tileAt(40.44, -79.99, 15), pittsburgh)).toBe(true);
    expect(grantCoversTile(tileAt(40.74, -79.99, 15), north)).toBe(true);
    expect(grantCoversTile(tileAt(40.74, -79.99, 15), pittsburgh)).toBe(false);
  });

  it("rejects a grant whose area was widened", async () => {
    const [grant = ""] = await createReportMapGrants(reportWithGrid);
    const widened = grant.replace(/^[^~]+/, "-80");

    expect(await verifyReportMapGrant(widened)).toBeNull();
  });

  it("issues no grant without a Maps key", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "");

    expect(await createReportMapGrants(reportWithGrid)).toEqual([]);
  });
});
