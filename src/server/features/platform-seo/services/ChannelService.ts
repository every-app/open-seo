import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { getDevtoUser } from "../channels/devto";
import { listHashnodePublications } from "../channels/hashnode";
import { ChannelRepository as repo } from "../repositories/ChannelRepository";
import { SyndicationRepository } from "../repositories/SyndicationRepository";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { MIN_BETTER_AUTH_SECRET_LENGTH } from "@/shared/selfhost-checks";

// Platform tokens are sealed with CHANNEL_TOKEN_SECRET before they are
// stored, opened only in memory to send, and never returned, logged or put in
// an error message.

async function readSecret() {
  const secret = (await getOptionalEnvValue("CHANNEL_TOKEN_SECRET"))?.trim();
  return secret && secret.length >= MIN_BETTER_AUTH_SECRET_LENGTH
    ? secret
    : null;
}

async function requireSecret() {
  const secret = await readSecret();
  if (!secret) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      `Set CHANNEL_TOKEN_SECRET to at least ${MIN_BETTER_AUTH_SECRET_LENGTH} characters to connect publishing accounts.`,
    );
  }
  return secret;
}

async function seal(token: string) {
  return symmetricEncrypt({ key: await requireSecret(), data: token });
}

export async function openChannelToken(ciphertext: string) {
  return symmetricDecrypt({ key: await requireSecret(), data: ciphertext });
}

async function listChannels(organizationId: string) {
  const [channels, secret] = await Promise.all([
    repo.listChannels(organizationId),
    readSecret(),
  ]);
  return { channels, canConnect: secret !== null };
}

type ConnectOutcome =
  | { outcome: "connected"; channelId: string; replaced: boolean }
  | { outcome: "problem"; message: string }
  | {
      outcome: "choose";
      publications: { id: string; title: string; url: string | null }[];
    };

// The key is checked with Dev.to before it is stored.
async function connectDevto(
  organizationId: string,
  apiKey: string,
): Promise<ConnectOutcome> {
  await requireSecret();
  const user = await getDevtoUser(apiKey);
  if (!user.ok) return { outcome: "problem", message: user.problem.message };
  const channel = await repo.insertChannel({
    organizationId,
    type: "devto",
    displayName: `Dev.to · @${user.value.username}`,
    publicationId: null,
    accountUrl: `https://dev.to/${user.value.username}`,
    tokenCiphertext: await seal(apiKey),
  });
  return {
    outcome: "connected",
    channelId: channel.id,
    replaced: channel.replaced,
  };
}

// Without a publication, an account with several blogs asks which one; the
// chosen id must be one of the token's own.
async function connectHashnode(
  organizationId: string,
  token: string,
  publicationId: string | undefined,
): Promise<ConnectOutcome> {
  await requireSecret();
  const account = await listHashnodePublications(token);
  if (!account.ok) {
    return { outcome: "problem", message: account.problem.message };
  }
  const { publications, username } = account.value;
  if (publications.length === 0) {
    return {
      outcome: "problem",
      message:
        "This Hashnode account has no blog yet. Create one, then connect again.",
    };
  }
  const chosen = publicationId
    ? publications.find((p) => p.id === publicationId)
    : publications.length === 1
      ? publications[0]
      : undefined;
  if (!chosen) return { outcome: "choose", publications };
  const channel = await repo.insertChannel({
    organizationId,
    type: "hashnode",
    displayName: `Hashnode · ${chosen.title}`,
    publicationId: chosen.id,
    accountUrl: chosen.url ?? `https://hashnode.com/@${username}`,
    tokenCiphertext: await seal(token),
  });
  return {
    outcome: "connected",
    channelId: channel.id,
    replaced: channel.replaced,
  };
}

// Disconnecting drops the channel's unpublished copies here; drafts and posts
// on the platform stay there. A channel with live posts stays connected, since
// those posts are what tracking follows.
async function disconnect(organizationId: string, channelId: string) {
  const channel = await repo.getChannelWithToken(organizationId, channelId);
  if (!channel) throw new AppError("NOT_FOUND");
  if (await SyndicationRepository.hasPublished(channel.id)) {
    return { outcome: "in_use" as const };
  }
  await repo.deleteChannel(organizationId, channel.id);
  return { outcome: "disconnected" as const };
}

export const ChannelService = {
  listChannels,
  connectDevto,
  connectHashnode,
  disconnect,
} as const;
