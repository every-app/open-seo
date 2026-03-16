import { useForm } from "@tanstack/react-form";
import { useEffect } from "react";
import type {
  KeywordMode,
  ResultLimit,
} from "@/client/features/keywords/keywordResearchTypes";

type UseKeywordControlsFormInput = {
  keywordInput: string;
  locationCode: number;
  resultLimit: ResultLimit;
  keywordMode: KeywordMode;
};

export function useKeywordControlsForm(input: UseKeywordControlsFormInput) {
  const form = useForm({
    defaultValues: {
      keyword: input.keywordInput,
      locationCode: input.locationCode,
      resultLimit: input.resultLimit,
      mode: input.keywordMode,
    },
  });

  useEffect(() => {
    form.setFieldValue("keyword", input.keywordInput);
    form.setFieldValue("locationCode", input.locationCode);
    form.setFieldValue("resultLimit", input.resultLimit);
    form.setFieldValue("mode", input.keywordMode);
  }, [
    form,
    input.keywordInput,
    input.keywordMode,
    input.locationCode,
    input.resultLimit,
  ]);

  return form;
}
