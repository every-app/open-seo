// Moving a self-hosted OpenSEO into OpenSEO on an Every App Gateway. The
// Gateway install shows a transfer code, its address plus a one-time secret,
// and the self-hosted install sends its data there with it.

/** Why a move couldn't start or stopped, for the dialog's copy. */
export enum TransferProblem {
  /** The pasted text isn't a transfer code. */
  InvalidCode = "invalid_code",
  /** The Gateway install refused the code: expired, already used or replaced. */
  CodeRejected = "code_rejected",
  /** The two installs were built with different database migrations. */
  VersionMismatch = "version_mismatch",
  /** An audit or check is still running in this install. */
  RunningWork = "running_work",
  /** A password-account install with more than one organization. */
  MultipleOrganizations = "multiple_organizations",
  /** The Gateway install couldn't be reached, or failed partway. */
  Unreachable = "unreachable",
}

// 32 random bytes as base64url.
const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function formatTransferCode(origin: string, secret: string) {
  return `${origin}#${secret}`;
}

/** The Gateway install's origin and the secret, or null for anything else. */
export function parseTransferCode(
  value: string,
): { origin: string; secret: string } | null {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  const secret = url.hash.slice(1);
  if (url.protocol !== "https:" || !SECRET_PATTERN.test(secret)) return null;
  return { origin: url.origin, secret };
}
