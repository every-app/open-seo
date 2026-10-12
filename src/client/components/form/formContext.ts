import { createFormHookContexts } from "@tanstack/react-form";

// Its own module so the field components and `useAppForm` can both import the
// contexts without a cycle.
export const { fieldContext, formContext, useFieldContext, useFormContext } =
  createFormHookContexts();
