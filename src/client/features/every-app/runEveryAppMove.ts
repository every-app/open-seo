import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  finishEveryAppMove,
  sendEveryAppMoveChat,
  sendEveryAppMoveFiles,
  sendEveryAppMoveRows,
  startEveryAppMove,
} from "@/serverFunctions/everyAppTransfer";
import {
  parseTransferCode,
  TransferProblem,
} from "@/shared/every-app-transfer";

// Runs a move to Every App from the Move to Every App dialog, one step at a
// time, and says why it stopped when it does.

export enum MovePhase {
  Data = "data",
  Chats = "chats",
  Files = "files",
}

export type MoveState =
  | { status: "idle" }
  | { status: "moving"; phase: MovePhase; done: number; total: number }
  | { status: "done"; origin: string }
  | { status: "failed"; message: string };

type MoveFailure = { problem: TransferProblem };

class MoveStoppedError extends Error {
  constructor(readonly failure: MoveFailure) {
    super(failure.problem);
  }
}

function problemMessage({ problem }: MoveFailure) {
  switch (problem) {
    case TransferProblem.InvalidCode:
      return "That isn't a transfer code. Copy it again from OpenSEO on your Gateway.";
    case TransferProblem.CodeRejected:
      return "This code expired, was used or was replaced. Make a new one and try again.";
    case TransferProblem.VersionMismatch:
      return "This install and your Gateway run different OpenSEO versions. Update both to the latest release, then try again.";
    case TransferProblem.RunningWork:
      return "An audit or check is still running here. Try again once it finishes.";
    case TransferProblem.MultipleOrganizations:
      return "This install has more than one organization, and a move can only take one.";
    case TransferProblem.Unreachable:
      return "Couldn't reach OpenSEO on your Gateway. Check it's installed and up to date, then try again.";
  }
}

type MoveResult<T> =
  | { ok: true; value: T }
  | { ok: false; problem: TransferProblem };

function unwrap<T>(result: MoveResult<T>): T {
  if (!result.ok) throw new MoveStoppedError(result);
  return result.value;
}

// Sends the move one step at a time. Every step is safe to repeat, so
// Try again starts over.
export async function runMove(
  code: string,
  setState: (state: MoveState) => void,
  stopped: { current: boolean },
) {
  try {
    setState({ status: "moving", phase: MovePhase.Data, done: 0, total: 0 });
    const { tables, chats } = unwrap(
      await startEveryAppMove({ data: { code } }),
    );
    const total = tables.reduce((sum, entry) => sum + entry.rows, 0);
    let done = 0;
    for (const { table } of tables) {
      let after = 0;
      let tableDone = false;
      while (!tableDone) {
        if (stopped.current) return;
        const result = unwrap(
          await sendEveryAppMoveRows({ data: { code, table, after } }),
        );
        done += result.sent;
        after = result.after;
        tableDone = result.done;
        setState({ status: "moving", phase: MovePhase.Data, done, total });
      }
    }
    for (let index = 0; index < chats; index += 1) {
      if (stopped.current) return;
      setState({
        status: "moving",
        phase: MovePhase.Chats,
        done: index,
        total: chats,
      });
      unwrap(await sendEveryAppMoveChat({ data: { code, index } }));
    }
    let cursor: string | null = null;
    let files = 0;
    do {
      if (stopped.current) return;
      setState({
        status: "moving",
        phase: MovePhase.Files,
        done: files,
        total: 0,
      });
      const result: { sent: number; cursor: string | null } = unwrap(
        await sendEveryAppMoveFiles({ data: { code, cursor } }),
      );
      files += result.sent;
      cursor = result.cursor;
    } while (cursor);
    unwrap(await finishEveryAppMove({ data: { code } }));
    setState({ status: "done", origin: parseTransferCode(code)?.origin ?? "" });
  } catch (error) {
    if (stopped.current) return;
    setState({
      status: "failed",
      message:
        error instanceof MoveStoppedError
          ? problemMessage(error.failure)
          : getStandardErrorMessage(error),
    });
  }
}
