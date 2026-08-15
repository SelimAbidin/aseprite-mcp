import { randomUUID } from "node:crypto";

import { BRIDGE_PROTOCOL_VERSION } from "../constants.js";
import { secretsEqual } from "../security/secrets.js";
import { BridgeError, bridgeDisconnectedError } from "./errors.js";
import {
  bridgeHelloSchema,
  bridgeResponseSchema,
  type BridgeClient,
  type BridgeRequest,
} from "./protocol.js";

type Unsubscribe = () => void;

export interface BridgeConnection {
  close(code: number, reason: string): void;
  onClose(listener: () => void): Unsubscribe;
  onMessage(listener: (message: string) => void): Unsubscribe;
  send(message: string): Promise<void>;
}

export interface BridgeSnapshot {
  readonly client?: BridgeClient;
  readonly connected: boolean;
  readonly connectedAt?: string;
}

export interface AsepriteBridgeOptions {
  readonly handshakeTimeoutMs?: number;
  readonly requestTimeoutMs: number;
  readonly token: string | undefined;
}

interface PendingRequest {
  readonly reject: (error: BridgeError) => void;
  readonly resolve: (result: unknown) => void;
  readonly timeout: NodeJS.Timeout;
}

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 5_000;

export class AsepriteBridge {
  readonly #handshakeTimeoutMs: number;
  readonly #pendingRequests = new Map<string, PendingRequest>();
  readonly #requestTimeoutMs: number;
  readonly #token: string | undefined;

  #candidateConnection: BridgeConnection | undefined;
  #client: BridgeClient | undefined;
  #connectedAt: Date | undefined;
  #connection: BridgeConnection | undefined;
  #connectionCleanup: Unsubscribe[] = [];

  public constructor(options: AsepriteBridgeOptions) {
    this.#handshakeTimeoutMs =
      options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
    this.#requestTimeoutMs = options.requestTimeoutMs;
    this.#token = options.token;
  }

  public acceptConnection(connection: BridgeConnection): void {
    if (
      this.#candidateConnection !== undefined ||
      this.#connection !== undefined
    ) {
      connection.close(1013, "An Aseprite extension is already connected");
      return;
    }

    this.#candidateConnection = connection;
    let authenticated = false;

    const handshakeTimeout = setTimeout(() => {
      connection.close(1008, "Bridge handshake timed out");
    }, this.#handshakeTimeoutMs);
    handshakeTimeout.unref();

    const unsubscribeMessage = connection.onMessage((message) => {
      if (!authenticated) {
        if (this.#candidateConnection !== connection) return;

        const hello = this.#parseJson(message, bridgeHelloSchema);

        if (hello === undefined || !this.#tokenMatches(hello.token)) {
          connection.close(1008, "Invalid bridge handshake");
          return;
        }

        authenticated = true;
        clearTimeout(handshakeTimeout);
        this.#candidateConnection = undefined;
        this.#connection = connection;
        this.#client = hello.client;
        this.#connectedAt = new Date();
        void connection
          .send(
            JSON.stringify({
              protocolVersion: BRIDGE_PROTOCOL_VERSION,
              type: "hello_accepted",
            }),
          )
          .catch(() => connection.close(1011, "Bridge handshake failed"));
        return;
      }

      this.#handleResponse(message, connection);
    });

    const unsubscribeClose = connection.onClose(() => {
      clearTimeout(handshakeTimeout);
      unsubscribeMessage();
      unsubscribeClose();

      if (this.#candidateConnection === connection) {
        this.#candidateConnection = undefined;
      }

      if (this.#connection === connection) {
        this.#disconnect();
      }
    });

    this.#connectionCleanup = [unsubscribeMessage, unsubscribeClose];
  }

  public close(): void {
    this.#candidateConnection?.close(1001, "Server shutting down");
    this.#connection?.close(1001, "Server shutting down");
    this.#disconnect();
    this.#candidateConnection = undefined;
  }

  public request(
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const connection = this.#connection;

    if (connection === undefined) {
      return Promise.reject(bridgeDisconnectedError());
    }

    const id = randomUUID();
    const request: BridgeRequest = {
      id,
      method,
      params,
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
      type: "request",
    };

    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pendingRequests.delete(id);
        reject(
          new BridgeError(
            "BRIDGE_TIMEOUT",
            `Aseprite did not respond to ${method} within ${this.#requestTimeoutMs}ms.`,
          ),
        );
      }, this.#requestTimeoutMs);
      timeout.unref();

      this.#pendingRequests.set(id, { reject, resolve, timeout });

      void connection.send(JSON.stringify(request)).catch(() => {
        const pending = this.#pendingRequests.get(id);
        if (pending === undefined) return;

        clearTimeout(pending.timeout);
        this.#pendingRequests.delete(id);
        pending.reject(bridgeDisconnectedError());
      });
    });
  }

  public snapshot(): BridgeSnapshot {
    if (this.#connection === undefined || this.#client === undefined) {
      return { connected: false };
    }

    return {
      client: this.#client,
      connected: true,
      ...(this.#connectedAt === undefined
        ? {}
        : { connectedAt: this.#connectedAt.toISOString() }),
    };
  }

  #disconnect(): void {
    for (const unsubscribe of this.#connectionCleanup) unsubscribe();
    this.#connectionCleanup = [];
    this.#connection = undefined;
    this.#client = undefined;
    this.#connectedAt = undefined;

    for (const pending of this.#pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(bridgeDisconnectedError());
    }
    this.#pendingRequests.clear();
  }

  #handleResponse(message: string, connection: BridgeConnection): void {
    const response = this.#parseJson(message, bridgeResponseSchema);

    if (response === undefined) {
      connection.close(1002, "Invalid bridge response");
      return;
    }

    const pending = this.#pendingRequests.get(response.id);
    if (pending === undefined) return;

    clearTimeout(pending.timeout);
    this.#pendingRequests.delete(response.id);

    if (response.ok) {
      pending.resolve(response.result);
      return;
    }

    pending.reject(
      new BridgeError(
        response.error.code,
        response.error.message,
        response.error.details,
      ),
    );
  }

  #parseJson<T>(
    message: string,
    schema: { safeParse(value: unknown): { data?: T; success: boolean } },
  ): T | undefined {
    try {
      const result = schema.safeParse(JSON.parse(message));
      return result.success ? result.data : undefined;
    } catch {
      return undefined;
    }
  }

  #tokenMatches(receivedToken: string | undefined): boolean {
    if (this.#token === undefined) return true;
    return (
      receivedToken !== undefined && secretsEqual(receivedToken, this.#token)
    );
  }
}
