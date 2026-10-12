import { z } from "zod";
import {
  HOSTED_PASSWORD_MAX_LENGTH,
  HOSTED_PASSWORD_MIN_LENGTH,
} from "@/lib/auth-options";

export const passwordSchema = z
  .string()
  .min(
    HOSTED_PASSWORD_MIN_LENGTH,
    `Password must be at least ${HOSTED_PASSWORD_MIN_LENGTH} characters.`,
  )
  .max(
    HOSTED_PASSWORD_MAX_LENGTH,
    `Password must be at most ${HOSTED_PASSWORD_MAX_LENGTH} characters.`,
  );
