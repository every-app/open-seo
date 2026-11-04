import { useId, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/client/components/ui/field";
import { Input } from "@/client/components/ui/input";
import {
  MAX_LOCAL_KEYWORD_LENGTH,
  MAX_LOCAL_KEYWORDS,
} from "@/types/schemas/local-seo";

/** The keywords entered, without blank rows or repeats. */
export function cleanKeywords(rows: string[]) {
  return [...new Set(rows.map((row) => row.trim()).filter(Boolean))];
}

/** One input per keyword. Pasting several lines fills several rows. */
export function LocalKeywordFields({
  value,
  onChange,
  description,
}: {
  value: string[];
  onChange: (rows: string[]) => void;
  description?: string;
}) {
  const id = useId();
  // The row "Add keyword" just created, so typing can start right away.
  const [addedRow, setAddedRow] = useState<number | null>(null);
  const setRows = (rows: string[]) => onChange(rows.length ? rows : [""]);
  return (
    <Field>
      <FieldLabel htmlFor={`${id}-0`}>Keywords to track</FieldLabel>
      {description && <FieldDescription>{description}</FieldDescription>}
      <div className="space-y-2">
        {value.map((keyword, index) => (
          <div key={index} className="flex items-center gap-1">
            <Input
              id={`${id}-${index}`}
              aria-label={`Keyword ${index + 1}`}
              placeholder="e.g. pizza delivery"
              maxLength={MAX_LOCAL_KEYWORD_LENGTH}
              autoFocus={index === addedRow}
              value={keyword}
              onChange={(event) =>
                setRows(
                  value.map((row, position) =>
                    position === index ? event.target.value : row,
                  ),
                )
              }
              onPaste={(event) => {
                const lines = event.clipboardData
                  .getData("text/plain")
                  .split(/\r?\n/)
                  .map((line) => line.trim())
                  .filter(Boolean);
                if (lines.length < 2) return;
                event.preventDefault();
                setRows(
                  [
                    ...value.slice(0, index),
                    ...lines,
                    ...value.slice(index + 1),
                  ].slice(0, MAX_LOCAL_KEYWORDS),
                );
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove keyword ${index + 1}`}
              onClick={() =>
                setRows(value.filter((_, position) => position !== index))
              }
            >
              <X />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="self-start w-auto!"
        disabled={value.length >= MAX_LOCAL_KEYWORDS}
        onClick={() => {
          setAddedRow(value.length);
          onChange([...value, ""]);
        }}
      >
        <Plus /> Add keyword
      </Button>
    </Field>
  );
}
