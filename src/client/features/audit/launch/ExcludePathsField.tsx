import { ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/client/components/ui/collapsible";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/client/components/ui/field";
import { Textarea } from "@/client/components/ui/textarea";
import type { useLaunchController } from "@/client/features/audit/launch/useLaunchController";
import { getFieldError } from "@/client/lib/forms";

/** Collapsed by default: most audits never exclude anything. */
export function ExcludePathsField({
  launchForm,
}: {
  launchForm: ReturnType<typeof useLaunchController>["launchForm"];
}) {
  return (
    <launchForm.Field name="excludePathsInput">
      {(field) => {
        const error = getFieldError(field.state.meta.errors);
        return (
          <Collapsible className="lg:col-span-12">
            <CollapsibleTrigger className="group inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
              <ChevronRight className="size-4 transition-transform group-data-panel-open:rotate-90" />
              Advanced
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <Field className="max-w-xl">
                <FieldLabel htmlFor="audit-exclude-paths">
                  Exclude paths
                </FieldLabel>
                <Textarea
                  id="audit-exclude-paths"
                  rows={3}
                  className="font-mono"
                  placeholder={"/blog/\n/*/print"}
                  aria-invalid={error ? true : undefined}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                />
                <FieldDescription>
                  One path per line. <code>/blog/</code> skips every page under
                  /blog/, and <code>*</code> matches anything. Skipped pages
                  aren't crawled and don't count toward Max pages.
                </FieldDescription>
              </Field>
            </CollapsibleContent>
            {/* Outside the panel, so a closed Advanced section can't hide it. */}
            {error ? <FieldError className="pt-2">{error}</FieldError> : null}
          </Collapsible>
        );
      }}
    </launchForm.Field>
  );
}
