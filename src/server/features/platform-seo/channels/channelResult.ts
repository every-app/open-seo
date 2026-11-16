// What a call to a publishing platform returns. A failed send is an expected
// outcome the user acts on (a bad token, a free Hashnode blog, a rejected
// tag), so it comes back as data with a message, not as a thrown error: the
// client only ever sees error codes.
type ChannelProblemKind =
  | "bad_token"
  | "pro_required"
  | "forbidden"
  | "rejected"
  | "not_found"
  | "rate_limited"
  | "unavailable";

export type ChannelProblem = { kind: ChannelProblemKind; message: string };

export type ChannelResult<T> =
  | { ok: true; value: T }
  | { ok: false; problem: ChannelProblem };

export const ok = <T>(value: T): ChannelResult<T> => ({ ok: true, value });

export const fail = <T>(
  kind: ChannelProblemKind,
  message: string,
): ChannelResult<T> => ({ ok: false, problem: { kind, message } });

export const TIMEOUT_MS = 30_000;
