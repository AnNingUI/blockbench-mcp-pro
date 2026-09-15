import { makeError, type ErrorCode, type ErrorPayload } from "@bbmcp/shared";

export class CommandError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.code = code;
    this.details = details;
  }

  toPayload(): ErrorPayload {
    return makeError(this.code, this.message, this.details);
  }
}

export function toErrorPayload(err: unknown): ErrorPayload {
  if (err instanceof CommandError) return err.toPayload();
  if (err instanceof Error) {
    const code = (err as { code?: ErrorCode }).code;
    return makeError(code ?? "E_BLOCKBENCH_ERROR", err.message);
  }
  return makeError("E_BLOCKBENCH_ERROR", String(err));
}
