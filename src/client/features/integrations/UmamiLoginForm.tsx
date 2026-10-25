import { useMutation } from "@tanstack/react-query";
import { revalidateLogic } from "@tanstack/react-form";
import { z } from "zod";
import { useAppForm } from "@/client/components/form/useAppForm";
import { saveUmamiInstance } from "@/serverFunctions/umami";
import {
  MAX_UMAMI_CUSTOM_HEADERS,
  normalizeUmamiBaseUrl,
  umamiHeaderSchema,
  type UmamiHeader,
} from "@/shared/umami";

type SavedLogin = Extract<
  Awaited<ReturnType<typeof saveUmamiInstance>>,
  { instance: unknown }
>;

/** One `Name: value` header per line. Returns an error message instead when
 *  a line doesn't parse, so the form can show it under the field. */
function parseHeaderLines(text: string): UmamiHeader[] | string {
  const headers: UmamiHeader[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const separator = line.indexOf(":");
    const parsed = umamiHeaderSchema.safeParse({
      name: separator > 0 ? line.slice(0, separator) : line,
      value: separator > 0 ? line.slice(separator + 1) : "",
    });
    if (!parsed.success) {
      return `${line.trim()}: ${parsed.error.issues[0]?.message ?? "invalid header"}`;
    }
    headers.push(parsed.data);
  }
  if (headers.length > MAX_UMAMI_CUSTOM_HEADERS) {
    return `Add at most ${MAX_UMAMI_CUSTOM_HEADERS} headers.`;
  }
  return headers;
}

const loginSchema = z
  .object({
    baseUrl: z
      .string()
      .trim()
      .min(1, "Enter your Umami URL.")
      .refine(
        (value) => normalizeUmamiBaseUrl(value) !== null,
        "Enter a URL like https://analytics.example.com.",
      ),
    authType: z.enum(["password", "api_key"]),
    username: z.string().trim(),
    secret: z.string().min(1, "Enter the password or API key."),
    headers: z.string().superRefine((value, ctx) => {
      const parsed = parseHeaderLines(value);
      if (typeof parsed === "string") {
        ctx.addIssue({ code: "custom", message: parsed });
      }
    }),
  })
  .refine(
    (value) => value.authType === "api_key" || value.username.length > 0,
    { path: ["username"], message: "Enter the Umami username." },
  );

const AUTH_TYPES = [
  { value: "password", label: "Username and password (self-hosted)" },
  { value: "api_key", label: "API key (Umami Cloud)" },
] as const;

/**
 * Adds an Umami login for the organization. The server signs in and lists
 * the websites before saving, so a wrong URL, password, or proxy header shows
 * up here instead of on the dashboard.
 */
export function UmamiLoginForm({
  projectId,
  onSaved,
}: {
  projectId: string;
  onSaved: (result: SavedLogin) => void;
}) {
  const saveMutation = useMutation({
    mutationFn: (values: z.infer<typeof loginSchema>) => {
      const headers = parseHeaderLines(values.headers);
      return saveUmamiInstance({
        data: {
          projectId,
          baseUrl: values.baseUrl,
          authType: values.authType,
          username:
            values.authType === "password" ? values.username : undefined,
          secret: values.secret,
          headers: typeof headers === "string" ? [] : headers,
        },
      });
    },
  });

  const form = useAppForm({
    defaultValues: {
      baseUrl: "",
      authType: "password" as "password" | "api_key",
      username: "",
      secret: "",
      headers: "",
    },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: loginSchema },
    onSubmit: async ({ value, formApi }) => {
      const result = await saveMutation.mutateAsync(value);
      if ("problem" in result) {
        const field =
          result.problem.code === "umami_auth_failed" ||
          result.problem.code === "umami_two_factor_required"
            ? "secret"
            : "baseUrl";
        formApi.setErrorMap({
          onSubmit: { fields: { [field]: result.problem.message } },
        });
        return;
      }
      onSaved(result);
    },
  });

  return (
    <form.AppForm>
      <form.Form className="space-y-3">
        <form.AppField name="baseUrl">
          {(field) => (
            <field.TextField
              label="Umami URL"
              description="The address you open Umami at. For Umami Cloud, use https://cloud.umami.is."
              placeholder="https://analytics.example.com"
              autoComplete="off"
              required
            />
          )}
        </form.AppField>
        <form.AppField name="authType">
          {(field) => (
            <field.SelectField label="Sign in with" items={AUTH_TYPES} />
          )}
        </form.AppField>
        <form.Subscribe selector={(state) => state.values.authType}>
          {(authType) =>
            authType === "password" ? (
              <form.AppField name="username">
                {(field) => (
                  <field.TextField
                    label="Username"
                    description="A view-only Umami user is enough. Two-factor sign-in isn't supported."
                    autoComplete="off"
                    required
                  />
                )}
              </form.AppField>
            ) : null
          }
        </form.Subscribe>
        <form.Subscribe selector={(state) => state.values.authType}>
          {(authType) => (
            <form.AppField name="secret">
              {(field) => (
                <field.TextField
                  label={authType === "password" ? "Password" : "API key"}
                  type="password"
                  autoComplete="off"
                  data-ph-mask
                  required
                />
              )}
            </form.AppField>
          )}
        </form.Subscribe>
        <form.AppField name="headers">
          {(field) => (
            <field.TextareaField
              label="Custom request headers (optional)"
              description="For an auth proxy in front of Umami, such as a Cloudflare Access service token. One Name: value per line. Stored encrypted."
              placeholder={"CF-Access-Client-Id: …\nCF-Access-Client-Secret: …"}
              className="font-mono"
              autoComplete="off"
              data-ph-mask
              rows={3}
            />
          )}
        </form.AppField>
        <form.SubmitButton>Sign in and list websites</form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}
