import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";

const signUpStatusSchema = z.object({ firstAccount: z.boolean() });

// Whether this standalone installation still has no account, so the auth
// pages can offer to create the administrator's
// (src/routes/api/sign-up-status.ts).
export const signUpStatusQueryOptions = () =>
  queryOptions({
    queryKey: ["sign-up-status"],
    queryFn: async () => {
      const response = await fetch("/api/sign-up-status");
      if (!response.ok) throw new Error(`sign-up status: ${response.status}`);
      return signUpStatusSchema.parse(await response.json());
    },
    // Fresh on every mount (the answer flips once the account exists), but
    // not behind the user's back while a form is on screen.
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
