const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

export async function verifySvixSignature(args: {
  headers: Headers;
  payload: string;
  secret: string;
  nowSeconds?: number;
}) {
  const id = getHeader(args.headers, "svix-id", "webhook-id");
  const timestamp = getHeader(
    args.headers,
    "svix-timestamp",
    "webhook-timestamp",
  );
  const signatureHeader = getHeader(
    args.headers,
    "svix-signature",
    "webhook-signature",
  );

  if (!id || !timestamp || !signatureHeader) {
    return false;
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }

  const nowSeconds = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - timestampSeconds) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const signedContent = `${id}.${timestamp}.${args.payload}`;
  const expected = await hmacSha256(args.secret, signedContent);

  return signatureHeader.split(" ").some((signaturePart) => {
    const [version, signature] = signaturePart.split(",", 2);
    if (version !== "v1" || !signature) return false;

    try {
      return constantTimeEqual(expected, base64ToBytes(signature));
    } catch {
      return false;
    }
  });
}

function getHeader(headers: Headers, ...names: string[]) {
  for (const name of names) {
    const value = headers.get(name);
    if (value) return value;
  }
}

async function hmacSha256(secret: string, value: string) {
  const rawSecret = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const key = await crypto.subtle.importKey(
    "raw",
    base64ToBytes(rawSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );

  return new Uint8Array(signature);
}

function base64ToBytes(value: string) {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);

  for (let i = 0; i < decoded.length; i += 1) {
    bytes[i] = decoded.charCodeAt(i);
  }

  return bytes;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;

  let difference = 0;
  for (let i = 0; i < left.length; i += 1) {
    difference |= left[i] ^ right[i];
  }

  return difference === 0;
}
