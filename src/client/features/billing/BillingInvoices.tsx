import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { QueryError } from "@/client/components/QueryState";
import { buttonVariants } from "@/client/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/client/components/ui/field";
import { Skeleton } from "@/client/components/ui/skeleton";
import { Switch } from "@/client/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { billingAccountQueryOptions } from "@/client/features/billing/billingAccountQuery";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { queryClient } from "@/client/tanstack-db";
import {
  listBillingInvoices,
  setInvoiceEmails,
} from "@/serverFunctions/billing";

const dateFormat: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
};

function formatDate(epochMs: number) {
  return new Date(epochMs).toLocaleDateString(undefined, dateFormat);
}

function formatAmount(total: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(total);
}

const invoicesQueryOptions = queryOptions({
  queryKey: ["billing", "invoices"],
  queryFn: () => listBillingInvoices(),
});

/** Invoice emails and the newest invoices, the billing Invoices tab.
 *  Owner-only at the call site, as the server enforces: invoices show the
 *  billing address. */
export function BillingInvoices({
  invoiceEmailsEnabled,
}: {
  invoiceEmailsEnabled: boolean;
}) {
  return (
    <div className="space-y-4">
      <InvoiceEmailsToggle invoiceEmailsEnabled={invoiceEmailsEnabled} />
      <InvoiceTable />
    </div>
  );
}

function InvoiceEmailsToggle({
  invoiceEmailsEnabled,
}: {
  invoiceEmailsEnabled: boolean;
}) {
  const mutation = useMutation({
    mutationFn: (enabled: boolean) => setInvoiceEmails({ data: { enabled } }),
    // The error shows inline under the switch.
    meta: { errorToast: false },
    onSuccess: (_, enabled) => {
      queryClient.setQueryData(billingAccountQueryOptions().queryKey, (prev) =>
        prev ? { ...prev, invoiceEmailsEnabled: enabled } : prev,
      );
    },
  });

  const checked = mutation.isPending
    ? mutation.variables
    : invoiceEmailsEnabled;

  return (
    <Field>
      <div className="flex items-center gap-2">
        <Switch
          id="billing-invoice-emails"
          checked={checked}
          disabled={mutation.isPending}
          onCheckedChange={(enabled) => mutation.mutate(enabled)}
        />
        <FieldLabel htmlFor="billing-invoice-emails">
          Email me a receipt for each invoice
        </FieldLabel>
      </div>
      <FieldDescription>
        Stripe sends the receipt to the billing email on your account after each
        payment.
      </FieldDescription>
      {mutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {getStandardErrorMessage(
            mutation.error,
            "We couldn't save this setting. Please try again.",
          )}
        </p>
      ) : null}
    </Field>
  );
}

function InvoiceTable() {
  const invoicesQuery = useQuery(invoicesQueryOptions);

  if (invoicesQuery.isPending) {
    return (
      <div aria-busy className="space-y-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (invoicesQuery.isError) {
    return (
      <QueryError
        error={invoicesQuery.error}
        fallback="We couldn't load your invoices. Please try again."
        onRetry={() => void invoicesQuery.refetch()}
        isRetrying={invoicesQuery.isFetching}
      />
    );
  }

  const { invoices, hasMore } = invoicesQuery.data;

  if (invoices.length === 0) {
    return <p className="text-sm text-muted-foreground">No invoices yet.</p>;
  }

  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Billing period</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>
              <span className="sr-only">Download</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((invoice) => (
            <TableRow key={invoice.id}>
              <TableCell className="font-medium">
                {invoice.number ?? "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {formatDate(invoice.createdAt)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {invoice.periodStart !== null && invoice.periodEnd !== null
                  ? `${formatDate(invoice.periodStart)} – ${formatDate(invoice.periodEnd)}`
                  : "—"}
              </TableCell>
              <TableCell className="tabular-nums">
                {formatAmount(invoice.total, invoice.currency)}
              </TableCell>
              <TableCell className="capitalize">{invoice.status}</TableCell>
              <TableCell className="text-right">
                {invoice.pdfUrl ? (
                  <a
                    href={invoice.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                    aria-label={`Download ${invoice.number ?? "invoice"} PDF`}
                  >
                    <Download />
                    PDF
                  </a>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {hasMore ? (
        <p className="text-xs text-muted-foreground">
          Showing your newest invoices. Find older invoices under Manage
          subscription.
        </p>
      ) : null}
    </div>
  );
}
