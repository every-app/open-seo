// The project's default market: the country/language pair its data calls
// fall back to. Mirrors resolveMarket's project argument in shared/.
export type ProjectMarket = { locationCode: number; languageCode: string };

// Shape returned by the getProjects server function (a mapped project row).
export type ProjectSummary = {
  id: string;
  name: string;
  // The name AI visibility looks for. Null uses the project name.
  brandName: string | null;
  domain: string | null;
  // Default market for the project's data calls.
  locationCode: number;
  languageCode: string;
  createdAt: string;
};
