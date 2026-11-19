import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { getAuthMode } from "@/lib/auth-mode";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import { requireOrgPermission } from "@/server/auth/org-gate";
import {
  EveryAppMoveSender,
  MoveRefusedError,
} from "@/server/features/every-app-transfer/EveryAppMoveSender";
import { EveryAppTransferReceiver } from "@/server/features/every-app-transfer/EveryAppTransferReceiver";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { getPublicOrigin } from "@/server/mcp/public-origin";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

// Moving a self-hosted OpenSEO into OpenSEO on an Every App Gateway. The
// Gateway install makes the transfer code; the self-hosted install sends.

async function authMode() {
  return getAuthMode(await getOptionalEnvValue("AUTH_MODE"));
}

// Only a self-hosted install moves (hosted can't, and an Every App install is
// where a move goes), and since it sends the whole install, only its owner.
// A refusal the dialog explains comes back as data; anything else throws.
async function ownerMove<T>(
  context: Pick<EnsuredUserContext, "role">,
  run: () => Promise<T>,
) {
  const mode = await authMode();
  if (mode === "hosted" || mode === "everyapp") throw new AppError("FORBIDDEN");
  requireOrgPermission(context, { organization: ["delete"] });
  try {
    await EveryAppMoveSender.requireWholeInstall({
      passwordMode: mode === "password",
    });
    return { ok: true as const, value: await run() };
  } catch (error) {
    if (!(error instanceof MoveRefusedError)) throw error;
    return { ok: false as const, problem: error.problem };
  }
}

const code = z.string().trim().min(1).max(1000);

/** On the Gateway install: a one-time code for a self-hosted install to move here. */
export const createEveryAppTransferCode = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    if ((await authMode()) !== "everyapp") throw new AppError("FORBIDDEN");
    requireOrgPermission(context, { organization: ["update"] });
    return EveryAppTransferReceiver.createTransferCode({
      userId: context.userId,
      origin: getPublicOrigin(getRequest()),
    });
  });

/** Checks this install can move, and starts the move. */
export const startEveryAppMove = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ code }))
  .handler(({ data, context }) =>
    ownerMove(context, () => EveryAppMoveSender.startMove(data.code)),
  );

export const sendEveryAppMoveRows = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      code,
      table: z.string().min(1).max(100),
      after: z.number().int().min(0),
    }),
  )
  .handler(({ data, context }) =>
    ownerMove(context, () =>
      EveryAppMoveSender.sendRows(data.code, data.table, data.after),
    ),
  );

export const sendEveryAppMoveChat = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ code, index: z.number().int().min(0) }))
  .handler(({ data, context }) =>
    ownerMove(context, () =>
      EveryAppMoveSender.sendChat(data.code, data.index),
    ),
  );

export const sendEveryAppMoveFiles = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ code, cursor: z.string().max(2000).nullable() }))
  .handler(({ data, context }) =>
    ownerMove(context, () =>
      EveryAppMoveSender.sendFiles(data.code, data.cursor),
    ),
  );

export const finishEveryAppMove = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(z.object({ code }))
  .handler(({ data, context }) =>
    ownerMove(context, () => EveryAppMoveSender.finishMove(data.code)),
  );
