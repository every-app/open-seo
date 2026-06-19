import { AppError } from "@/server/lib/errors";

function statusForAppError(code: string): number {
  switch (code) {
    case "UNAUTHENTICATED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "VALIDATION_ERROR":
      return 400;
    case "PAYMENT_REQUIRED":
      return 402;
    default:
      return 500;
  }
}

// Maps a thrown error to a Response for raw API routes (which, unlike server
// functions, have no error middleware). AppErrors carry their status; anything
// else becomes a 500 with the given fallback message.
export function responseForAppError(
  error: unknown,
  fallbackMessage: string,
): Response {
  if (error instanceof AppError) {
    return new Response(error.message, {
      status: statusForAppError(error.code),
    });
  }
  return new Response(fallbackMessage, { status: 500 });
}
