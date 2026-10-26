import { AuditRepository } from "@/server/features/audit/repositories/AuditRepository";
import {
  CrawlerCredentialService,
  type SealedCrawlerAccess,
} from "@/server/features/audit/services/CrawlerCredentialService";
import type { AuditConfig } from "@/server/lib/audit/types";
import {
  isShopifyHost,
  resolveStartUrlRedirects,
} from "@/server/lib/audit/url-policy";

/**
 * The audit workflow's first step. Anchors the audit to the site's real
 * origin: a start domain that 301s elsewhere (…net -> …com, apex -> www)
 * would otherwise dead-end after one page at the same-origin crawl boundary.
 */
export async function resolveAuditStart(input: {
  auditId: string;
  organizationId: string;
  projectId: string;
  startUrl: string;
  config: AuditConfig;
  access?: SealedCrawlerAccess | null;
}) {
  // The probe itself can be rate limited, so it carries the credential too.
  const probe = await resolveStartUrlRedirects(
    input.startUrl,
    await CrawlerCredentialService.openCrawlerAccess(input.access),
  );
  const startUrl = probe.url;
  const startHost = new URL(startUrl).hostname;
  let access = input.access ?? null;
  let crawlerCredentialId = input.config.crawlerCredentialId;
  if (startHost !== new URL(input.startUrl).hostname) {
    const credential = await CrawlerCredentialService.resolveCrawlerAccess(
      input.organizationId,
      input.projectId,
      startHost,
    );
    access = credential?.sealed ?? null;
    crawlerCredentialId = credential?.id;
  }
  const config: AuditConfig = {
    ...input.config,
    // Shopify storefronts answer with `powered-by: Shopify`; knowing this is
    // what lets a rendered crawl read throttled pages and the report explain
    // an unrendered one. A throttled probe sees no header, but a saved
    // signature is always Shopify's, and so is a host in Shopify's range.
    sitePlatform:
      access ||
      probe.poweredBy?.toLowerCase().includes("shopify") ||
      (await isShopifyHost(startHost))
        ? "shopify"
        : undefined,
    crawlerCredentialId,
  };
  await AuditRepository.updateAuditStart(input.auditId, startUrl, config);
  return { startUrl, config, access };
}
