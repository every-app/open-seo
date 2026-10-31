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

// Checkout can't sell the yearly plans yet, so /subscribe sends people who
// pick one to support, or lets them start monthly and switch later.
export function AnnualPlanDialog({
  open,
  onOpenChange,
  planName,
  annualPriceUsd,
  onSubscribeMonthly,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planName: string;
  annualPriceUsd: number;
  onSubscribeMonthly: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Yearly plans are set up by email for now</DialogTitle>
          <DialogDescription>
            Email {SUPPORT_EMAIL} and we&rsquo;ll move you to the {planName} at
            ${annualPriceUsd.toLocaleString()}/year. Paying yearly in the app is
            coming soon.
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Want to start today? Subscribe monthly now, and when you switch
          we&rsquo;ll credit the rest of your month toward the yearly plan.
        </p>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onSubscribeMonthly();
            }}
          >
            Subscribe monthly
          </Button>
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
