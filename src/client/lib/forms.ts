type FormValidationErrors = {
  form?: string;
  fields?: Record<string, string>;
} | null;

type FieldValidationFormApi<TField extends string> = {
  state: {
    submissionAttempts: number;
  };
  getFieldMeta: (field: TField) =>
    | {
        isTouched?: boolean;
      }
    | undefined;
};

export function createFormValidationErrors({
  fields,
  form,
}: {
  fields?: Record<string, string | null | undefined>;
  form?: string | null | undefined;
}): FormValidationErrors {
  const normalizedFields: Record<string, string> = {};

  for (const [key, value] of Object.entries(fields ?? {})) {
    if (typeof value === "string") {
      normalizedFields[key] = value;
    }
  }

  if (!form && Object.keys(normalizedFields).length === 0) {
    return null;
  }

  return {
    fields:
      Object.keys(normalizedFields).length > 0 ? normalizedFields : undefined,
    form: form ?? undefined,
  };
}

export function getFormError(error: unknown): string | null {
  if (typeof error === "string") {
    return error;
  }

  if (
    error &&
    typeof error === "object" &&
    "form" in error &&
    typeof error.form === "string"
  ) {
    return error.form;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return null;
}

export function getFieldError(errors: readonly unknown[]) {
  return getFormError(errors[0]);
}

export function shouldValidateFieldOnChange<TField extends string>(
  formApi: FieldValidationFormApi<TField>,
  field: TField,
) {
  return (
    formApi.state.submissionAttempts > 0 ||
    Boolean(formApi.getFieldMeta(field)?.isTouched)
  );
}
