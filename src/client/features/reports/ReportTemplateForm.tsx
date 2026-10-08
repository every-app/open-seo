import { useId, useState } from "react";
import { revalidateLogic } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { useAppForm } from "@/client/components/form/useAppForm";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/client/components/ui/field";
import { Input } from "@/client/components/ui/input";
import { getFieldError } from "@/client/lib/forms";
import { captureClientEvent } from "@/client/lib/posthog";
import { formatCount } from "@/shared/format";
import {
  contrastRatio,
  hexColorSchema,
  REPORT_MIN_TEXT_CONTRAST,
  REPORT_SURFACE,
} from "@/shared/report-brand";
import { saveReportTemplate } from "@/serverFunctions/reportTemplates";
import {
  REPORT_TEMPLATE_MAX_LOGO_CHARS,
  type ReportTemplate,
} from "@/types/schemas/report-templates";

// One form for create and edit. Shape only, as at every other boundary: the
// caps come back from the service with their copy and show in a toast.
const formSchema = z.object({
  name: z.string().trim().min(1, "Give the template a name."),
  description: z
    .string()
    .trim()
    .min(1, "Say in one line when to use this template."),
  instructions: z
    .string()
    .trim()
    .min(1, "Say who the report is for and which sections it has."),
  // Empty means no color; the mutation sends it as null to clear a stored one.
  brandColor: z.literal("").or(hexColorSchema),
  brandColor2: z.literal("").or(hexColorSchema),
  accentColor: z.literal("").or(hexColorSchema),
  canvasColor: z.literal("").or(hexColorSchema),
  // Undefined keeps the stored logo, so an edit never round-trips its bytes.
  logoDataUri: z.string().nullable().optional(),
});

type FormValues = z.infer<typeof formSchema>;
type ColorKey = "brandColor" | "brandColor2" | "accentColor" | "canvasColor";

const INSTRUCTIONS_PLACEHOLDER = `Audience: the client's marketing lead, not technical.
Sections, in order: Where we are / What we did this month / What moved / What to expect next.
Tone: plain and confident. Gloss every SEO term. No exclamation points.
Sign off as: Acme SEO`;

export function ReportTemplateForm({
  projectId,
  template,
  onClose,
  onSaved,
}: {
  projectId: string;
  /** The template being edited, or undefined when creating one. */
  template?: ReportTemplate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const saveMutation = useMutation({
    // A refusal (duplicate name, the cap) comes back as `{ ok: false }` rather
    // than an error, because thrown errors reach the client stripped to their
    // code. Rethrowing it here lets the mutation cache toast its message.
    mutationFn: async ({
      brandColor,
      brandColor2,
      accentColor,
      canvasColor,
      logoDataUri,
      ...values
    }: FormValues) => {
      const result = await saveReportTemplate({
        data: {
          projectId,
          templateId: template?.id,
          ...values,
          brand: {
            brandColor: brandColor || null,
            brandColor2: brandColor2 || null,
            accentColor: accentColor || null,
            canvasColor: canvasColor || null,
            logoDataUri,
          },
        },
      });
      if (!result.ok) throw new Error(result.message);
      return result;
    },
    onSuccess: (result) => {
      captureClientEvent("report_template:saved", {
        project_id: projectId,
        is_update: !result.created,
        source: "app",
      });
      toast.success(result.created ? "Template created" : "Template saved");
      onSaved();
    },
  });

  const form = useAppForm({
    defaultValues: {
      name: template?.name ?? "",
      description: template?.description ?? "",
      instructions: template?.instructions ?? "",
      brandColor: template?.brandColor ?? "",
      brandColor2: template?.brandColor2 ?? "",
      accentColor: template?.accentColor ?? "",
      canvasColor: template?.canvasColor ?? "",
      logoDataUri: undefined,
    } as FormValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: formSchema },
    onSubmit: ({ value }) => saveMutation.mutateAsync(value),
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saveMutation.isPending) onClose();
      }}
    >
      <DialogContent showCloseButton={false} className="sm:max-w-2xl">
        <form.AppForm>
          <form.Form className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>
                {template ? "Edit template" : "New template"}
              </DialogTitle>
            </DialogHeader>

            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  label="Name"
                  placeholder="Monthly client check-in"
                  required
                />
              )}
            </form.AppField>

            <form.AppField name="description">
              {(field) => (
                <field.TextField
                  label="Description"
                  description="One line saying when to use it. This is what an agent reads to decide."
                  placeholder="The monthly update we send retainer clients."
                  required
                />
              )}
            </form.AppField>

            <form.AppField name="instructions">
              {(field) => (
                <field.TextareaField
                  label="Instructions"
                  description="Brand voice for the whole project lives in Context › Writing preferences."
                  className="h-56 font-mono leading-relaxed md:text-xs"
                  placeholder={INSTRUCTIONS_PLACEHOLDER}
                  required
                />
              )}
            </form.AppField>

            <FieldSet className="rounded-lg border p-4">
              <FieldLegend variant="label">Branding (optional)</FieldLegend>
              <FieldDescription>
                Written into every report saved from this template. Leave empty
                for the neutral look.
              </FieldDescription>
              <div className="grid gap-4 sm:grid-cols-2">
                {COLOR_FIELDS.map(({ key, label, hint }) => (
                  <form.Field key={key} name={key}>
                    {(field) => (
                      <ColorField
                        label={label}
                        hint={hint}
                        value={field.state.value}
                        error={getFieldError(field.state.meta.errors)}
                        onChange={(value) => field.handleChange(value)}
                        onBlur={field.handleBlur}
                      />
                    )}
                  </form.Field>
                ))}
              </div>
              <form.Subscribe
                selector={(state) => [
                  state.values.accentColor,
                  state.values.canvasColor,
                ]}
              >
                {([accent, canvas]) => (
                  <AccentContrast accent={accent} canvas={canvas} />
                )}
              </form.Subscribe>
              <form.Field name="logoDataUri">
                {(field) => (
                  <LogoField
                    value={field.state.value}
                    storedChars={template?.logoChars ?? null}
                    onChange={(value) => field.handleChange(value)}
                  />
                )}
              </form.Field>
            </FieldSet>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                disabled={saveMutation.isPending}
              >
                Cancel
              </Button>
              <form.SubmitButton>
                {template ? "Save changes" : "Create template"}
              </form.SubmitButton>
            </DialogFooter>
          </form.Form>
        </form.AppForm>
      </DialogContent>
    </Dialog>
  );
}

const COLOR_FIELDS: { key: ColorKey; label: string; hint: string }[] = [
  {
    key: "brandColor",
    label: "Brand color",
    hint: "Chart bars, the top strip, markers.",
  },
  {
    key: "brandColor2",
    label: "Gradient end",
    hint: "Optional. Fills fade from the brand color to this.",
  },
  {
    key: "accentColor",
    label: "Accent text color",
    hint: "Labels and the headline highlight.",
  },
  { key: "canvasColor", label: "Page background", hint: "Light only." },
];

function ColorField({
  label,
  hint,
  value,
  error,
  onChange,
  onBlur,
}: {
  label: string;
  hint: string;
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  onBlur: () => void;
}) {
  const id = useId();
  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          className="h-9 w-11 shrink-0 cursor-pointer rounded-md border bg-background p-1"
          value={value || "#ffffff"}
          onChange={(event) => onChange(event.target.value)}
        />
        <Input
          id={id}
          className="font-mono"
          placeholder="none"
          value={value}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange(event.target.value.trim())}
          onBlur={onBlur}
        />
      </div>
      <FieldDescription>{hint}</FieldDescription>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}

/** Live version of the service's accent check, so a refusal is no surprise. */
function AccentContrast({
  accent,
  canvas,
}: {
  accent: string;
  canvas: string;
}) {
  if (!hexColorSchema.safeParse(accent).success) return null;
  const background = hexColorSchema.safeParse(canvas).success
    ? canvas
    : REPORT_SURFACE;
  const ratio = Math.min(
    contrastRatio(accent, background),
    contrastRatio(accent, REPORT_SURFACE),
  );
  if (ratio >= REPORT_MIN_TEXT_CONTRAST) {
    return (
      <FieldDescription>Accent contrast {ratio.toFixed(1)}:1.</FieldDescription>
    );
  }
  return (
    <FieldError>
      Accent contrast {ratio.toFixed(1)}:1, below the {REPORT_MIN_TEXT_CONTRAST}
      :1 text needs. Use a darker shade.
    </FieldError>
  );
}

function LogoField({
  value,
  storedChars,
  onChange,
}: {
  /** Undefined keeps the stored logo, null removes it, a string replaces it. */
  value: string | null | undefined;
  storedChars: number | null;
  onChange: (value: string | null | undefined) => void;
}) {
  const id = useId();
  const [error, setError] = useState<string | null>(null);
  const hasStored = value === undefined && storedChars !== null;
  const maxKb = formatCount(REPORT_TEMPLATE_MAX_LOGO_CHARS / 1000);

  const readFile = (file: File) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const dataUri = reader.result;
      if (typeof dataUri !== "string") return;
      if (dataUri.length > REPORT_TEMPLATE_MAX_LOGO_CHARS) {
        setError(
          `That file is ${formatCount(Math.ceil(dataUri.length / 1000))} KB once encoded; the limit is ${maxKb} KB. Export a smaller wordmark, about 320 pixels wide, or use SVG.`,
        );
        return;
      }
      setError(null);
      onChange(dataUri);
    });
    reader.readAsDataURL(file);
  };

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id}>Logo</FieldLabel>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          <img
            src={value}
            alt="Logo preview"
            className="h-8 max-w-48 rounded bg-white object-contain p-1"
          />
        ) : hasStored ? (
          <span className="text-sm text-muted-foreground">
            Logo saved ({formatCount(Math.ceil(storedChars / 1000))} KB)
          </span>
        ) : null}
        <Input
          id={id}
          type="file"
          className="w-auto"
          accept="image/png,image/webp,image/jpeg,image/svg+xml"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) readFile(file);
          }}
        />
        {value || hasStored ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(null)}
          >
            Remove
          </Button>
        ) : null}
      </div>
      <FieldDescription>
        A wide wordmark reads best. PNG, WebP, JPEG or SVG, up to {maxKb} KB.
      </FieldDescription>
      {error ? <FieldError>{error}</FieldError> : null}
    </Field>
  );
}
