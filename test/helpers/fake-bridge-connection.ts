import type { BridgeConnection } from "../../src/bridge/aseprite-bridge.js";

export class FakeBridgeConnection implements BridgeConnection {
  readonly sentMessages: string[] = [];

  closeCode: number | undefined;
  closeReason: string | undefined;

  readonly #closeListeners = new Set<() => void>();
  readonly #messageListeners = new Set<(message: string) => void>();

  public close(code: number, reason: string): void {
    this.closeCode = code;
    this.closeReason = reason;
    this.emitClose();
  }

  public emitClose(): void {
    for (const listener of [...this.#closeListeners]) listener();
  }

  public emitMessage(message: unknown): void {
    const serialized =
      typeof message === "string" ? message : JSON.stringify(message);
    for (const listener of [...this.#messageListeners]) listener(serialized);
  }

  public onClose(listener: () => void): () => void {
    this.#closeListeners.add(listener);
    return () => this.#closeListeners.delete(listener);
  }

  public onMessage(listener: (message: string) => void): () => void {
    this.#messageListeners.add(listener);
    return () => this.#messageListeners.delete(listener);
  }

  public async send(message: string): Promise<void> {
    this.sentMessages.push(message);
  }
}

export function bridgeHello(token?: string): Record<string, unknown> {
  return {
    client: {
      apiVersion: 36,
      asepriteVersion: "1.3.16",
      name: "aseprite-mcp-extension",
      version: "0.1.0",
    },
    protocolVersion: 1,
    ...(token === undefined ? {} : { token }),
    type: "hello",
  };
}
