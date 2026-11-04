import { useId } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/client/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/client/components/ui/popover";
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

  return (
    <controlsForm.Subscribe selector={(state) => state.values}>
      {(values) => {
        // Google-Ads-only countries ignore source, clickstream, and grouping.
        const labs = isLabsLocationCode(values.locationCode);
        const local = Boolean(values.locationName);

        // Options that don't apply to this search don't count.
        const changedCount = [
          values.resultLimit !== RESULT_LIMITS[0],
          labs && values.mode !== "auto",
          labs && !local && values.clickstream,
          labs && groupKeywords,
        ].filter(Boolean).length;

        return (
          <Popover>
            <PopoverTrigger
              render={<Button variant="outline" className="font-normal" />}
            >
              <SlidersHorizontal data-icon="inline-start" />
              Options
              {changedCount > 0 ? (
                <Badge variant="secondary" size="sm">
                  {changedCount}
                </Badge>
              ) : null}
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 gap-4 p-4">
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
            </PopoverContent>
          </Popover>
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
