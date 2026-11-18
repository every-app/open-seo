// celld's WebCrypto has no AES-KW (denoland/celld#295), and
// @cloudflare/workers-oauth-provider wraps every grant and token key with it,
// so MCP sign-in fails on the Docker edition. This adds AES-KW (RFC 3394) on
// top of AES-CBC, which celld supports. The output is byte-for-byte native
// AES-KW, so grants stay readable once celld adds it and this file goes.
// Only the raw import, wrap and unwrap the OAuth library calls are covered.

const subtle = crypto.subtle;

const ZERO_IV = new Uint8Array(16);
const DEFAULT_IV = new Uint8Array(8).fill(0xa6);

function isAesKw(algorithm: AlgorithmIdentifier) {
  const name = typeof algorithm === "string" ? algorithm : algorithm.name;
  return name.toUpperCase() === "AES-KW";
}

function toBytes(data: BufferSource) {
  return ArrayBuffer.isView(data)
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data);
}

// One AES block: CBC with a zero IV, minus the PKCS#7 padding block.
async function encryptBlock(key: CryptoKey, block: Uint8Array<ArrayBuffer>) {
  const out = await subtle.encrypt(
    { name: "AES-CBC", iv: ZERO_IV },
    key,
    block,
  );
  return new Uint8Array(out, 0, 16);
}

// WebCrypto checks PKCS#7 padding on decrypt, so append a block that
// decrypts to a full padding block: CBC XORs it with `block`, giving 16x 0x10.
async function decryptBlock(key: CryptoKey, block: Uint8Array) {
  const padding = new Uint8Array(16).map((_, i) => 16 ^ block[i]);
  const tail = await encryptBlock(key, padding);
  const input = new Uint8Array(32);
  input.set(block);
  input.set(tail, 16);
  const out = await subtle.decrypt(
    { name: "AES-CBC", iv: ZERO_IV },
    key,
    input,
  );
  return new Uint8Array(out);
}

function xorCounter(a: Uint8Array, t: number) {
  for (let k = 7; k >= 0 && t > 0; k--) {
    a[k] ^= t & 0xff;
    t >>>= 8;
  }
}

async function wrap(key: CryptoKey, plain: Uint8Array) {
  const n = plain.length / 8;
  const a = DEFAULT_IV.slice();
  const r = Array.from({ length: n }, (_, i) => plain.slice(i * 8, i * 8 + 8));
  const block = new Uint8Array(16);
  for (let j = 0; j < 6; j++) {
    for (let i = 0; i < n; i++) {
      block.set(a);
      block.set(r[i], 8);
      const b = await encryptBlock(key, block);
      a.set(b.subarray(0, 8));
      xorCounter(a, n * j + i + 1);
      r[i] = b.slice(8);
    }
  }
  const out = new Uint8Array(8 * (n + 1));
  out.set(a);
  r.forEach((ri, i) => out.set(ri, 8 * (i + 1)));
  return out;
}

async function unwrap(key: CryptoKey, wrapped: Uint8Array) {
  const n = wrapped.length / 8 - 1;
  const a = wrapped.slice(0, 8);
  const r = Array.from({ length: n }, (_, i) =>
    wrapped.slice(8 * (i + 1), 8 * (i + 2)),
  );
  const block = new Uint8Array(16);
  for (let j = 5; j >= 0; j--) {
    for (let i = n - 1; i >= 0; i--) {
      xorCounter(a, n * j + i + 1);
      block.set(a);
      block.set(r[i], 8);
      const b = await decryptBlock(key, block);
      a.set(b.subarray(0, 8));
      r[i] = b.slice(8);
    }
  }
  if (!a.every((byte, i) => byte === DEFAULT_IV[i])) {
    throw new DOMException("AES-KW integrity check failed", "OperationError");
  }
  const out = new Uint8Array(8 * n);
  r.forEach((ri, i) => out.set(ri, 8 * i));
  return out;
}

type ImportKeyArgs = [
  format: string,
  keyData: BufferSource | JsonWebKey,
  algorithm: AlgorithmIdentifier,
  extractable: boolean,
  usages: KeyUsage[],
];
type WrapKeyArgs = [
  format: string,
  key: CryptoKey,
  wrappingKey: CryptoKey,
  algorithm: AlgorithmIdentifier,
];
type UnwrapKeyArgs = [
  format: string,
  wrappedKey: BufferSource,
  unwrappingKey: CryptoKey,
  algorithm: AlgorithmIdentifier,
  unwrappedKeyAlgorithm: AlgorithmIdentifier,
  extractable: boolean,
  usages: KeyUsage[],
];

// Anything other than AES-KW goes to the native method as called. Its
// overloads can't take a spread argument list, hence Reflect.apply.
function callNative<T>(method: (...args: never[]) => unknown, args: unknown[]) {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the native method's own result
  return Reflect.apply(method, subtle, args) as Promise<T>;
}

export function installAesKw() {
  const nativeImportKey = subtle.importKey.bind(subtle);
  const nativeWrapKey = subtle.wrapKey.bind(subtle);
  const nativeUnwrapKey = subtle.unwrapKey.bind(subtle);

  Object.assign(subtle, {
    async importKey(...args: ImportKeyArgs): Promise<CryptoKey> {
      const [format, keyData, algorithm] = args;
      if (
        format !== "raw" ||
        !isAesKw(algorithm) ||
        !(keyData instanceof ArrayBuffer || ArrayBuffer.isView(keyData))
      ) {
        return callNative<CryptoKey>(nativeImportKey, args);
      }
      // An AES-CBC key stands in for the AES-KW one.
      return nativeImportKey("raw", keyData, "AES-CBC", false, [
        "encrypt",
        "decrypt",
      ]);
    },

    async wrapKey(...args: WrapKeyArgs): Promise<ArrayBuffer> {
      const [format, key, wrappingKey, algorithm] = args;
      if (format !== "raw" || !isAesKw(algorithm)) {
        return callNative<ArrayBuffer>(nativeWrapKey, args);
      }
      const plain = new Uint8Array(await subtle.exportKey("raw", key));
      return (await wrap(wrappingKey, plain)).buffer;
    },

    async unwrapKey(...args: UnwrapKeyArgs): Promise<CryptoKey> {
      const [format, wrappedKey, unwrappingKey, algorithm, ...importArgs] =
        args;
      if (format !== "raw" || !isAesKw(algorithm)) {
        return callNative<CryptoKey>(nativeUnwrapKey, args);
      }
      const plain = await unwrap(unwrappingKey, toBytes(wrappedKey));
      return nativeImportKey("raw", plain, ...importArgs);
    },
  });
}
