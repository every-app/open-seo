import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { SUPPORT_EMAIL } from "@/client/lib/support";

// Checkout sells the yearly plans to organizations without a plan. A monthly
// subscriber who picks one on /subscribe is sent to support, who credit what
// is left of the month they paid for.
export function AnnualPlanDialog({
  open,
  onOpenChange,
  planName,
  annualPriceUsd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planName: string;
  annualPriceUsd: number;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Switching to yearly is set up by email for now
          </DialogTitle>
          <DialogDescription>
            Email {SUPPORT_EMAIL} and we&rsquo;ll move you to the {planName} at
            ${annualPriceUsd.toLocaleString()}/year. We&rsquo;ll credit the rest
            of your month toward it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            nativeButton={false}
            render={
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                  `Yearly ${planName}`,
                )}`}
              />
            }
          >
            Email us
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
