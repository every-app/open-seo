/**
 * Binds the first-party OpenSEO Workers (Alchemy stage `everyapp`) to the
 * hosted Every App gateway, the one binding Alchemy can't express (it drops
 * service-binding props). `pnpm deploy:everyapp:first-party` runs it after
 * every deploy, since each deploy re-uploads the Workers without it:
 *
 *   pnpm everyapp:bind-gateway
 *
 * Reads .env.everyapp: CLOUDFLARE_ACCOUNT_ID, EVERYAPP_BINDING_API_TOKEN (Workers
 * Scripts: Edit on that account) and EVERYAPP_PLATFORM_ORG_ID. See
 * docs/EVERY_APP_DEPLOYMENT.md.
 */
import process from "node:process";
import { bindEveryAppGateway } from "../deploy/alchemy/alchemy.everyapp.ts";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Set ${name} in .env.everyapp.`);
  return value;
}

const { workers, props } = await bindEveryAppGateway({
  accountId: requiredEnv("CLOUDFLARE_ACCOUNT_ID"),
  apiToken: requiredEnv("EVERYAPP_BINDING_API_TOKEN"),
  platformOrganizationId: requiredEnv("EVERYAPP_PLATFORM_ORG_ID"),
});
console.log(
  `Bound EVERY_APP_GATEWAY on ${workers.join(" and ")} with ${JSON.stringify(props)}.`,
);
