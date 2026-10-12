import { useId, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { FormDialog } from "@/client/components/FormDialog";
import { Button } from "@/client/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/client/components/ui/field";
import { Switch } from "@/client/components/ui/switch";
import {
  RESULT_LIMITS,
  type KeywordMode,
} from "@/client/features/keywords/keywordResearchTypes";
import { isLabsLocationCode } from "@/client/features/keywords/locations";
import type { KeywordResearchControllerState } from "./types";

type Props = {
  controller: KeywordResearchControllerState;
};

const RESULT_ITEMS = RESULT_LIMITS.map((limit) => ({
  value: limit,
  label: `${limit} results`,
}));

const MODE_ITEMS: { value: KeywordMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "suggestions", label: "Phrase match" },
  { value: "ideas", label: "Category ideas" },
  { value: "related", label: "People also search for" },
];

const GOOGLE_ADS_ONLY_NOTE =
  "Not available for countries served from Google Ads data.";

/** The search settings most people leave at their defaults. */
export function KeywordSearchOptions({ controller }: Props) {
  const {
    controlsForm,
    preferredGroupKeywords: groupKeywords,
    setPreferredGroupKeywords: setGroupKeywords,
  } = controller;
  const [open, setOpen] = useState(false);

  return (
    <controlsForm.Subscribe selector={(state) => state.values}>
      {(values) => {
        // Google-Ads-only countries ignore source, clickstream, and grouping.
        const labs = isLabsLocationCode(values.locationCode);
        const local = Boolean(values.locationName);

        return (
          <>
            <Button
              variant="outline"
              className="w-full font-normal lg:w-auto lg:shrink-0"
              aria-haspopup="dialog"
              onClick={() => setOpen(true)}
            >
              <SlidersHorizontal data-icon="inline-start" />
              Options
            </Button>

            {open ? (
              <FormDialog
                title="Search options"
                onClose={() => setOpen(false)}
                actions={<Button onClick={() => setOpen(false)}>Done</Button>}
              >
                <controlsForm.AppField name="resultLimit">
                  {(field) => (
                    <field.SelectField label="Results" items={RESULT_ITEMS} />
                  )}
                </controlsForm.AppField>

                <controlsForm.AppField name="mode">
                  {(field) => (
                    <field.SelectField
                      label="Keyword source"
                      description={labs ? undefined : GOOGLE_ADS_ONLY_NOTE}
                      items={MODE_ITEMS}
                      disabled={!labs}
                    />
                  )}
                </controlsForm.AppField>

                <controlsForm.Field name="clickstream">
                  {(field) => (
                    <ToggleRow
                      label="Clickstream-refined volumes"
                      help={
                        !labs
                          ? GOOGLE_ADS_ONLY_NOTE
                          : local
                            ? "Not available for local results. Clickstream data covers whole countries only."
                            : "Google reports one combined volume for similar keywords. This estimates each keyword's own volume. Costs 2x the credits."
                      }
                      // The saved choice returns when the option applies again.
                      checked={labs && !local && field.state.value}
                      disabled={!labs || local}
                      onChange={(checked) => field.handleChange(checked)}
                    />
                  )}
                </controlsForm.Field>

                <ToggleRow
                  label="Group keywords"
                  help={labs ? undefined : GOOGLE_ADS_ONLY_NOTE}
                  checked={labs && groupKeywords}
                  disabled={!labs}
                  onChange={setGroupKeywords}
                />
              </FormDialog>
            ) : null}
          </>
        );
      }}
    </controlsForm.Subscribe>
  );
}

function ToggleRow({
  label,
  help,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  help?: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();

  return (
    <Field orientation="horizontal" data-disabled={disabled}>
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {help ? (
          <FieldDescription id={`${id}-description`}>{help}</FieldDescription>
        ) : null}
      </FieldContent>
      <Switch
        id={id}
        aria-describedby={help ? `${id}-description` : undefined}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </Field>
  );
}
