import { z } from "zod";
import removedSites from "./removed-sites.json";
import { within } from "./links";

// Sites that asked for no reports. Add a site's name to removed-sites.json
// and deploy: from then on it can't be asked for, a report waiting for it is
// not written, and one already written is no longer served. A name covers
// every name under it, so removing example.com removes app.example.com too.

const removed = z.array(z.string()).parse(removedSites);

export const isRemoved = (site: string, sites: readonly string[] = removed) =>
  sites.some((name) => within(site, name));
