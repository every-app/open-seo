import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  cacheableJson,
  guardToolRequest,
  jsonResponse,
  readToolBody,
  normalizeDomain,
  readCached,
  writeCached,
} from "@/lib/free-tools/server";
import { brand } from "@/lib/brand";
import { freeTools } from "@/lib/free-tools/tool-pages";

const TOOL = freeTools["domain-age-checker"];
// Registration data barely moves; a week of caching keeps RDAP registries
// from seeing repeated lookups for popular domains.
const CACHE_TTL_SECONDS = 7 * 86_400;
const MAX_DOMAINS = 10;

const requestSchema = z.object({
  domains: z
    .array(z.string().trim().min(1).max(300))
    .min(1, "Enter at least one domain")
    .max(MAX_DOMAINS, `Enter up to ${MAX_DOMAINS} domains`),
  turnstileToken: z.string().max(4096).optional(),
});

const rdapSchema = z
  .object({
    events: z
      .array(
        z
          .object({
            eventAction: z.string().nullable().optional(),
            eventDate: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .nullable()
      .optional(),
    entities: z
      .array(
        z
          .object({
            roles: z.array(z.string()).nullable().optional(),
            vcardArray: z.unknown().optional(),
          })
          .passthrough(),
      )
      .nullable()
      .optional(),
  })
  .passthrough();

type DomainAgeRow = {
  domain: string;
  created: string | null;
  updated: string | null;
  expires: string | null;
  registrar: string | null;
  ageYears: number | null;
  ageMonths: number | null;
  error: string | null;
};

export const Route = createFileRoute("/api/domain-age-checker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await readToolBody(request);
        if (body instanceof Response) return body;
        const parsed = requestSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse(
            { error: parsed.error.issues[0]?.message ?? "Invalid request" },
            400,
          );
        }

        const domains = [
          ...new Set(
            parsed.data.domains
              .map(normalizeDomain)
              .filter((domain): domain is string => domain !== null),
          ),
        ];
        if (domains.length === 0) {
          return jsonResponse(
            { error: "Enter at least one valid domain, like example.com" },
            400,
          );
        }

        // No DataForSEO call and no daily budget: RDAP is free, so the rate
        // limiter is the only thing standing between this and a scraper.
        const blocked = await guardToolRequest({
          tool: TOOL.slug,
          request,
          turnstileToken: parsed.data.turnstileToken,
        });
        if (blocked) return blocked;

        const cached = await Promise.all(
          domains.map((domain) => readCached<DomainAgeRow>(TOOL.slug, domain)),
        );

        const rows = await Promise.all(
          domains.map(async (domain, index) => {
            const entry = cached[index];
            if (entry?.ok) return entry.data;
            const row = await lookupDomain(domain);
            // Only successful lookups are cached for a week; a failed row is
            // cached briefly so a flaky registry isn't hammered.
            await writeCached(
              TOOL.slug,
              domain,
              { ok: true, data: row },
              row.error ? 300 : CACHE_TTL_SECONDS,
            );
            return row;
          }),
        );

        return cacheableJson({ rows }, CACHE_TTL_SECONDS);
      },
    },
  },
});

function emptyRow(domain: string, error: string | null): DomainAgeRow {
  return {
    domain,
    created: null,
    updated: null,
    expires: null,
    registrar: null,
    ageYears: null,
    ageMonths: null,
    error,
  };
}

async function lookupDomain(domain: string): Promise<DomainAgeRow> {
  const tld = domain.slice(domain.lastIndexOf(".") + 1);
  let response: Response;
  try {
    // rdap.org redirects to the registry that actually holds the record.
    response = await fetch(`https://rdap.org/domain/${domain}`, {
      headers: {
        Accept: "application/rdap+json",
        // rdap.org answers 403 to requests with no User-Agent, and the
        // Workers runtime doesn't set one.
        "User-Agent": `${brand.name} free tools (+${brand.marketingUrl}/domain-age-checker)`,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error(`RDAP lookup failed for ${domain}:`, err);
    return emptyRow(domain, "Registration lookup timed out");
  }

  // rdap.org 404s without redirecting when no registry serves that TLD; a
  // 404 from the registry it redirected to means the domain isn't registered.
  const answeredByRegistry = !response.url.startsWith("https://rdap.org/");
  if (!response.ok) {
    return emptyRow(
      domain,
      response.status === 404 && answeredByRegistry
        ? "No registration record found"
        : `No public registration data for .${tld}`,
    );
  }

  const parsed = rdapSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    return emptyRow(domain, `No public registration data for .${tld}`);
  }

  const events = parsed.data.events ?? [];
  const eventDate = (action: string) =>
    events.find((event) => event.eventAction?.toLowerCase() === action)
      ?.eventDate ?? null;

  const created = eventDate("registration");
  const age = created ? ageSince(created) : null;

  return {
    domain,
    created,
    updated: eventDate("last changed"),
    expires: eventDate("expiration"),
    registrar: readRegistrar(parsed.data.entities ?? []),
    ageYears: age?.years ?? null,
    ageMonths: age?.months ?? null,
    error: created ? null : "No registration date published",
  };
}

function ageSince(isoDate: string): { years: number; months: number } | null {
  const created = new Date(isoDate);
  if (Number.isNaN(created.getTime())) return null;
  const now = new Date();
  let months =
    (now.getFullYear() - created.getFullYear()) * 12 +
    (now.getMonth() - created.getMonth());
  if (now.getDate() < created.getDate()) months -= 1;
  if (months < 0) return { years: 0, months: 0 };
  return { years: Math.floor(months / 12), months: months % 12 };
}

/** RDAP entities carry the registrar name in a jCard `fn` entry. */
function readRegistrar(
  entities: Array<{ roles?: string[] | null; vcardArray?: unknown }>,
): string | null {
  const registrar = entities.find((entity) =>
    entity.roles?.some((role) => role.toLowerCase() === "registrar"),
  );
  if (!registrar || !Array.isArray(registrar.vcardArray)) return null;
  const fields = registrar.vcardArray[1];
  if (!Array.isArray(fields)) return null;
  for (const field of fields) {
    if (
      Array.isArray(field) &&
      field[0] === "fn" &&
      typeof field[3] === "string"
    ) {
      return field[3];
    }
  }
  return null;
}
