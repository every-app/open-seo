import { normalizeDomainTarget } from "@/client/features/domain/utils";
import { createFormValidationErrors } from "@/client/lib/forms";
import type { DomainControlsValues } from "@/client/features/domain/types";

export function getDomainSearchValidationErrors(value: DomainControlsValues) {
  if (!value.domain.trim()) {
    return createFormValidationErrors({
      fields: {
        domain: "Please enter a domain",
      },
    });
  }

  if (!normalizeDomainTarget(value.domain)) {
    return createFormValidationErrors({
      fields: {
        domain: "Please enter a valid URL or domain (e.g. example.com)",
      },
    });
  }

  return null;
}

export function getDomainSearchChangeValidationErrors(
  value: DomainControlsValues,
  shouldValidateUntouchedField: boolean,
  shouldValidateFormat: boolean,
) {
  if (!value.domain.trim()) {
    if (!shouldValidateUntouchedField) {
      return null;
    }

    return createFormValidationErrors({
      fields: {
        domain: "Please enter a domain",
      },
    });
  }

  if (!shouldValidateFormat) {
    return null;
  }

  return getDomainSearchValidationErrors(value);
}
