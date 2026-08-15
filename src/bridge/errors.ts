export class BridgeError extends Error {
  public readonly code: string;
  public readonly details: Readonly<Record<string, unknown>> | undefined;

  public constructor(
    code: string,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = "BridgeError";
    this.code = code;
    this.details = details;
  }
}

export function bridgeDisconnectedError(): BridgeError {
  return new BridgeError(
    "ASEPRITE_DISCONNECTED",
    "The Aseprite extension is not connected.",
  );
}
