import { queryOptions, type QueryKey } from "@tanstack/react-query";
import type {
  GooglePickerAccount,
  GooglePickerSelection,
} from "@/client/features/integrations/GooglePropertyPicker";
import {
  GoogleAnalyticsLogo,
  GoogleSearchConsoleLogo,
} from "@/client/features/integrations/GoogleProductLogos";
import {
  disconnectGa4,
  getGa4Connection,
  listGa4Properties,
  setGa4Property,
} from "@/serverFunctions/ga4";
import {
  disconnectGsc,
  getGscConnection,
  listGscSites,
  setGscSite,
} from "@/serverFunctions/gsc";
import { GA4_SELF_HOSTED_SETUP_DOCS_URL } from "@/shared/ga4";
import { GSC_SELF_HOSTED_SETUP_DOCS_URL } from "@/shared/gsc";

export type GoogleProvider = "gsc" | "ga4";

/** One project's connection to a Google product, in the same shape for both. */
export type GoogleConnection = {
  connected: boolean;
  reconnectRequired?: boolean;
  canManage: boolean;
  currentUserHasGrant: boolean;
  googleOAuthConfigured: boolean;
  connectedByEmail: string | null;
  property: string | null;
  propertyDetail: string | null;
};

type PickerOptions = {
  accounts: GooglePickerAccount[];
  selected: GooglePickerSelection | null;
};

type ProviderConfig = {
  title: string;
  name: string;
  Logo: typeof GoogleSearchConsoleLogo;
  docsUrl: string;
  getConnection: (projectId: string) => Promise<GoogleConnection>;
  accountsKey: string;
  listAccounts: (projectId: string) => Promise<PickerOptions>;
  save: (
    projectId: string,
    selection: GooglePickerSelection,
  ) => Promise<Partial<GoogleConnection>>;
  disconnect: (projectId: string) => Promise<unknown>;
  /** Queries that show this connection's data, refreshed after a change. */
  dependentKeys: (projectId: string) => QueryKey[];
};

type GscAccounts = Awaited<ReturnType<typeof listGscSites>>["accounts"];
type Ga4Accounts = Awaited<ReturnType<typeof listGa4Properties>>["accounts"];

/** The saved property is preselected when the user reopens the picker. */
function pickerOptions(accounts: GooglePickerAccount[]): PickerOptions {
  for (const account of accounts) {
    const property = account.properties.find((p) => p.isSelected);
    if (property)
      return {
        accounts,
        selected: { accountId: account.accountId, propertyId: property.id },
      };
  }
  return { accounts, selected: null };
}

function gscPickerOptions(accounts: GscAccounts): PickerOptions {
  return pickerOptions(
    accounts.map((account) => ({
      ...account,
      unavailable: account.propertiesUnavailable,
      properties: account.sites.map((site) => ({
        id: site.siteUrl,
        name: site.siteUrl,
        selectable: site.selectable,
        isSelected: site.isSelected,
      })),
    })),
  );
}

function ga4PickerOptions(accounts: Ga4Accounts): PickerOptions {
  return pickerOptions(
    accounts.map((account) => ({
      ...account,
      unavailable: account.propertiesUnavailable,
      properties: account.properties.map((property) => ({
        id: property.propertyId,
        name: property.displayName,
        detail: `${property.accountDisplayName} · ${property.propertyId.replace(/^properties\//, "")}`,
        selectable: true,
        isSelected: property.isSelected,
      })),
    })),
  );
}

export const googleProviders: Record<GoogleProvider, ProviderConfig> = {
  gsc: {
    title: "Google Search Console",
    name: "Search Console",
    Logo: GoogleSearchConsoleLogo,
    docsUrl: GSC_SELF_HOSTED_SETUP_DOCS_URL,
    getConnection: async (projectId) => {
      const connection = await getGscConnection({ data: { projectId } });
      return {
        ...connection,
        property: connection.siteUrl,
        propertyDetail: null,
      };
    },
    accountsKey: "gscSites",
    listAccounts: async (projectId) =>
      gscPickerOptions((await listGscSites({ data: { projectId } })).accounts),
    save: async (projectId, selection) => {
      const saved = await setGscSite({
        data: {
          projectId,
          accountId: selection.accountId,
          siteUrl: selection.propertyId,
        },
      });
      return {
        connected: true,
        connectedByEmail: saved.connectedByEmail,
        property: saved.siteUrl,
      };
    },
    disconnect: (projectId) => disconnectGsc({ data: { projectId } }),
    dependentKeys: (projectId) => [
      ["gscGrantStatus"],
      ["searchPerformance", projectId],
      ["searchPerformanceTable", projectId],
      ["dashboardActivation", projectId],
      ["dashboardGscReport", projectId],
    ],
  },
  ga4: {
    title: "Google Analytics",
    name: "Google Analytics",
    Logo: GoogleAnalyticsLogo,
    docsUrl: GA4_SELF_HOSTED_SETUP_DOCS_URL,
    getConnection: async (projectId) => {
      const connection = await getGa4Connection({ data: { projectId } });
      return {
        ...connection,
        property: connection.propertyDisplayName,
        propertyDetail: connection.propertyId,
      };
    },
    accountsKey: "ga4Properties",
    listAccounts: async (projectId) =>
      ga4PickerOptions(
        (await listGa4Properties({ data: { projectId } })).accounts,
      ),
    save: async (projectId, selection) => {
      const saved = await setGa4Property({ data: { projectId, ...selection } });
      return {
        connected: true,
        connectedByEmail: saved.connectedByEmail,
        property: saved.propertyDisplayName,
        propertyDetail: saved.propertyId,
      };
    },
    disconnect: (projectId) => disconnectGa4({ data: { projectId } }),
    dependentKeys: (projectId) => [
      ["dashboardActivation", projectId],
      ["dashboardGa4Report", projectId],
    ],
  },
};

export const googleConnectionOptions = (
  provider: GoogleProvider,
  projectId: string,
) =>
  queryOptions({
    queryKey: [`${provider}Connection`, projectId],
    queryFn: () => googleProviders[provider].getConnection(projectId),
  });
