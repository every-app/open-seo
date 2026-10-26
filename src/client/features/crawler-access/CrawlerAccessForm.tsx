import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { revalidateLogic } from "@tanstack/react-form";
import { useAppForm } from "@/client/components/form/useAppForm";
import { useAuditCapabilities } from "@/client/features/audit/shared";
import { isEveryAppClientAuthMode } from "@/lib/auth-mode";
import { saveCrawlerCredential } from "@/serverFunctions/crawlerAccess";
import {
  isCrawlerAccessExpired,
  parseSignatureExpiry,
} from "@/shared/crawler-access";

export const crawlerCredentialsQueryKey = ["crawler-credentials"];
export const saveCrawlerCredentialMutationKey = ["save-crawler-credential"];

/**
 * How CRAWLER_ACCESS_SECRET gets set, for every place that says a signature
 * can't be saved without it: the form here and the Shopify crawl warning.
 */
export function CrawlerAccessSetupHint() {
  return isEveryAppClientAuthMode() ? (
    <>
      An admin sets <code>CRAWLER_ACCESS_SECRET</code> with{" "}
      <code>pnpm everyapp secret set CRAWLER_ACCESS_SECRET --app openseo</code>.
    </>
  ) : (
    <>
      Set <code>CRAWLER_ACCESS_SECRET</code> (32 or more characters) on the
      server, then restart OpenSEO.
    </>
  );
}

const signatureSchema = z.object({
  host: z.string().trim().min(1, "Enter a domain."),
  signatureInput: z
    .string()
    .trim()
    .min(1, "Enter Signature-Input.")
    .refine(
      (value) => !isCrawlerAccessExpired(parseSignatureExpiry(value)),
      "This signature has already expired. Create a new one in Shopify admin.",
    ),
  signature: z.string().trim().min(1, "Enter Signature."),
});

/**
 * The two values a merchant copies out of Shopify admin. `Signature-Agent` is
 * a constant we add ourselves, so it is not asked for here.
 */
export function CrawlerAccessForm({
  projectId,
  initialHost,
  lockHost = false,
  onSaved,
}: {
  /** The project (website) the signature is stored on. */
  projectId: string;
  initialHost: string;
  lockHost?: boolean;
  onSaved?: () => void;
}) {
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationKey: saveCrawlerCredentialMutationKey,
    mutationFn: (values: z.infer<typeof signatureSchema>) =>
      saveCrawlerCredential({
        data: { projectId, ...values },
      }),
    onSuccess: async (result) => {
      if ("problem" in result) return;
      await queryClient.invalidateQueries({
        queryKey: crawlerCredentialsQueryKey,
      });
      toast.success(`Crawler access saved for ${result.credential.host}`);
      onSaved?.();
    },
  });

  const form = useAppForm({
    defaultValues: { host: initialHost, signatureInput: "", signature: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: signatureSchema },
    onSubmit: async ({ value, formApi }) => {
      const result = await saveMutation.mutateAsync(value);
      if ("problem" in result) {
        const { problem } = result;
        formApi.setErrorMap({
          onSubmit: {
            fields: {
              signatureInput:
                problem.reason === "wrong_domain"
                  ? `This signature was created for ${problem.signedHost}, not ${problem.host}. In Shopify admin, create a signature for ${problem.host}.`
                  : `Shopify won't accept this signature for ${problem.host}. Check that you created it for ${problem.host} and copied both values in full.`,
            },
          },
        });
        return;
      }
      formApi.reset({ ...value, signatureInput: "", signature: "" });
    },
  });

  // Saving needs CRAWLER_ACCESS_SECRET, which is optional: say so here
  // instead of failing on save.
  const canStoreCrawlerAccess =
    useAuditCapabilities(projectId).data?.canStoreCrawlerAccess;
  if (canStoreCrawlerAccess === false) {
    return (
      <p className="text-sm text-muted-foreground">
        Crawler access isn't set up yet. <CrawlerAccessSetupHint />
      </p>
    );
  }

  return (
    <form.AppForm>
      <form.Form className="space-y-3">
        {!lockHost ? (
          <form.AppField name="host">
            {(field) => (
              <field.TextField
                label="Domain"
                placeholder="store.example.com"
                className="font-mono"
                required
              />
            )}
          </form.AppField>
        ) : null}
        <form.AppField name="signatureInput">
          {(field) => (
            <field.TextField
              label="Signature-Input"
              type="password"
              autoComplete="off"
              data-ph-mask
              className="font-mono"
              placeholder="sig1=(...);expires=..."
              required
            />
          )}
        </form.AppField>
        <form.AppField name="signature">
          {(field) => (
            <field.TextField
              label="Signature"
              description="Shopify also shows a Signature-Agent value. You don't need to paste it: OpenSEO sends it with every request."
              type="password"
              autoComplete="off"
              data-ph-mask
              className="font-mono"
              placeholder="sig1=:...:"
              required
            />
          )}
        </form.AppField>
        <form.SubmitButton disabled={!projectId}>
          Save signature
        </form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}
