import { isIP } from "node:net";
import { parse } from "tldts";
import { z } from "zod";

// The names a report request is known by: the site it is about, the mailbox
// its email goes to, and the network it came from.

// The name is shown back: in the email, the report's title and the sign-up
// link, to an address the sender chose. No real site needs a long one (the
// longest of 4,486 startup domains is 35 characters and 3 labels), so a long
// name is refused before it can carry a message.
const MAX_SITE_CHARACTERS = 60;
const MAX_SITE_LABELS = 4;

/**
 * The site a submitted address names: its host, lower case, without "www."
 * and without the path, so every link to one site is one report. Null for
 * anything that isn't a public website: another scheme, credentials, a port,
 * an IP address, a name whose ending the public suffix list doesn't know
 * (.local, .internal), a name under .arpa or .onion, a bare public suffix
 * such as co.uk or github.io, which is many sites and not one, and a name
 * too long to be an ordinary site's. Nothing here requests the address.
 */
export function reportSite(input: string): string | null {
  let value = input.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;
  // One trailing dot is the same name written in full. Any other empty
  // label ("example.com..") is not a name at all.
  const host = url.hostname.replace(/\.$/, "").replace(/^(www\.)+/, "");
  const labels = host.split(".");
  if (labels.includes("")) return null;
  if (host.length > MAX_SITE_CHARACTERS || labels.length > MAX_SITE_LABELS)
    return null;
  const name = parse(host, { allowPrivateDomains: true });
  const known = name.isIcann === true || name.isPrivate === true;
  if (name.isIp || !name.domain || !known) return null;
  if (/(^|\.)(arpa|onion)$/.test(host)) return null;
  return host;
}

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email());

/**
 * The mailbox an address delivers to, for the daily limit: without a "+tag",
 * and for Gmail without dots, so one person's variants count as one address.
 * The email itself goes to the address as typed.
 */
export function mailbox(email: string): string {
  const at = email.lastIndexOf("@");
  const host = email.slice(at + 1);
  const name = email.slice(0, at).split("+")[0] ?? "";
  const gmail = host === "gmail.com" || host === "googlemail.com";
  return gmail ? `${name.replaceAll(".", "")}@gmail.com` : `${name}@${host}`;
}

// One server is often handed a whole IPv6 /48, so that block counts as one
// network: three 16-bit groups.
const IPV6_GROUPS = 3;

/** The network an address belongs to: an IPv4 address itself, or an IPv6 address's /48. Null for anything else. */
export function networkOf(address: string): string | null {
  const family = isIP(address);
  if (family === 4) return address;
  if (family !== 6) return null;
  const [head, tail] = new URL(`https://[${address}]/`).hostname
    .slice(1, -1)
    .split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const zeros = Array.from(
    { length: 8 - left.length - right.length },
    () => "0",
  );
  return [...left, ...zeros, ...right].slice(0, IPV6_GROUPS).join(":");
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** The day limits count in: UTC, as YYYY-MM-DD, the same day the free tools' budget uses. */
export const utcDay = (at: number) => new Date(at).toISOString().slice(0, 10);
