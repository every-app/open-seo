import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip";

/**
 * A label with a help tooltip, for table headers and stat labels. The trigger
 * is a span, so it can sit inside a sort button.
 */
export function HelpLabel({
  label,
  helpText,
}: {
  label: string;
  helpText: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger delay={150} render={<span />}>
        {label}
      </TooltipTrigger>
      <TooltipContent>{helpText}</TooltipContent>
    </Tooltip>
  );
}
