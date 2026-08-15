import { normalizeDomainTarget } from "@/client/features/domain/utils";
import { createFormValidationErrors } from "@/client/lib/forms";
import type { DomainControlsValues } from "@/client/features/domain/types";

export function getDomainSearchValidationErrors(value: DomainControlsValues) {
  if (!value.domain.trim()) {
    return createFormValidationErrors({
      fields: {
        domain: "请输入域名",
      },
    });
  }

  if (!normalizeDomainTarget(value.domain)) {
    return createFormValidationErrors({
      fields: {
        domain: "请输入有效的网址或域名，例如 example.com",
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
        domain: "请输入域名",
      },
    });
  }

  if (!shouldValidateFormat) {
    return null;
  }

  return getDomainSearchValidationErrors(value);
}
