import { useForm } from "@tanstack/react-form";
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
  return useForm({
    defaultValues: {
      keyword: input.keywordInput,
      locationCode: input.locationCode,
      resultLimit: input.resultLimit,
      mode: input.keywordMode,
    },
  });
}
