import { useEffect } from "react";
import { useForm } from "@tanstack/react-form";
import {
  createFormValidationErrors,
  shouldValidateFieldOnChange,
} from "@/client/lib/forms";
import {
  MAX_KEYWORDS_PER_SUBMIT,
  type KeywordMode,
  type ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";
import { parseKeywordInput } from "@/client/features/keywords/state/keywordControllerActions";

type UseKeywordControlsFormInput = {
  keywordInput: string;
  locationCode: number;
  resultLimit: ResultLimit;
  keywordMode: KeywordMode;
  clickstream: boolean;
};

export type KeywordControlsValues = {
  keyword: string;
  locationCode: number;
  resultLimit: ResultLimit;
  mode: KeywordMode;
  clickstream: boolean;
};

function getKeywordSearchValidationErrors(
  value: KeywordControlsValues,
  shouldValidateUntouchedField: boolean,
  validateEmptyKeyword: boolean,
) {
  const keywords = parseKeywordInput(value.keyword);

  if (keywords.length === 0) {
    if (!validateEmptyKeyword) return null;
    return createFormValidationErrors({
      fields: {
        keyword: "Please enter at least one keyword.",
      },
    });
  }

  if (!shouldValidateUntouchedField) return null;

  if (keywords.length > MAX_KEYWORDS_PER_SUBMIT) {
    return createFormValidationErrors({
      fields: {
        keyword: `Please enter no more than ${MAX_KEYWORDS_PER_SUBMIT} keywords (one per line).`,
      },
    });
  }

  return null;
}

export function useKeywordControlsForm(
  input: UseKeywordControlsFormInput,
  onSubmit: (value: KeywordControlsValues) => void,
) {
  const form = useForm({
    defaultValues: {
      keyword: input.keywordInput,
      locationCode: input.locationCode,
      resultLimit: input.resultLimit,
      mode: input.keywordMode,
      clickstream: input.clickstream,
    },
    validators: {
      onChange: ({ formApi, value }) =>
        getKeywordSearchValidationErrors(
          value,
          shouldValidateFieldOnChange(formApi, "keyword"),
          false,
        ),
      onSubmit: ({ value }) =>
        getKeywordSearchValidationErrors(value, true, true),
    },
    onSubmit: ({ value }) => {
      onSubmit(value);
    },
  });

  useEffect(() => {
    form.reset({
      keyword: input.keywordInput,
      locationCode: input.locationCode,
      resultLimit: input.resultLimit,
      mode: input.keywordMode,
      clickstream: input.clickstream,
    });
  }, [
    form,
    input.keywordInput,
    input.keywordMode,
    input.locationCode,
    input.resultLimit,
    input.clickstream,
  ]);

  return form;
}
