import type { BridgeClient } from "./protocol.js";

export interface BridgeSnapshot {
  readonly client?: BridgeClient;
  readonly connected: boolean;
}

export class AsepriteBridge {
  readonly #requestTimeoutMs: number;

  public constructor(requestTimeoutMs: number) {
    this.#requestTimeoutMs = requestTimeoutMs;
  }

  public snapshot(): BridgeSnapshot {
    return { connected: false };
  }

  public requestTimeoutMs(): number {
    return this.#requestTimeoutMs;
  }
}
