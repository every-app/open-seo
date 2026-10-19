import { DataTableTabs } from "@/client/components/table/DataTableToolbar";
import { TableCard } from "@/client/components/ui/table";
import { TabsTrigger } from "@/client/components/ui/tabs";
import { BillingFeatureBreakdown } from "@/client/features/billing/BillingFeatureBreakdown";
import { BillingInvoices } from "@/client/features/billing/BillingInvoices";
import { BillingUsageChart } from "@/client/features/billing/BillingUsageChart";
import { BILLING_TABS, type BillingTab } from "@/shared/billing";

/**
 * Usage and, for owners, invoices in one card with a tab row. Members see
 * usage alone: invoices follow the billing permission.
 */
export function BillingTabs({
  tab,
  onTabChange,
  invoiceEmailsEnabled,
}: {
  tab: BillingTab;
  onTabChange: (tab: BillingTab) => void;
  /** Null hides the Invoices tab. */
  invoiceEmailsEnabled: boolean | null;
}) {
  const showInvoices = invoiceEmailsEnabled !== null && tab === "invoices";

  return (
    <TableCard>
      {invoiceEmailsEnabled !== null ? (
        <DataTableTabs
          value={tab}
          onValueChange={(value) => {
            const next = BILLING_TABS.find((item) => item.value === value);
            if (next) onTabChange(next.value);
          }}
        >
          {BILLING_TABS.map((item) => (
            <TabsTrigger key={item.value} value={item.value}>
              {item.label}
            </TabsTrigger>
          ))}
        </DataTableTabs>
      ) : null}
      <div className="space-y-6 p-4">
        {showInvoices ? (
          <BillingInvoices invoiceEmailsEnabled={invoiceEmailsEnabled} />
        ) : (
          <>
            <BillingUsageChart />
            <BillingFeatureBreakdown />
          </>
        )}
      </div>
    </TableCard>
  );
}
