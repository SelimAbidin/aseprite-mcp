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
  onClose(listener: (info: BridgeCloseInfo) => void): Unsubscribe;
  onMessage(listener: (message: string) => void): Unsubscribe;
  send(message: string): Promise<void>;
}

export interface BridgeCloseInfo {
  readonly code: number;
  readonly reason: string;
}

export interface BridgeSnapshot {
  readonly client?: BridgeClient;
  readonly connected: boolean;
  readonly connectedAt?: string;
  readonly lastEvent: string;
  readonly lastEventAt: string;
  readonly phase: "connected" | "disconnected" | "handshaking";
  readonly recentEvents: readonly {
    readonly at: string;
    readonly event: string;
  }[];
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

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 30_000;

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
  #lastEvent = "bridge_started";
  #lastEventAt = new Date();
  #recentEvents: { at: Date; event: string }[] = [];

  public constructor(options: AsepriteBridgeOptions) {
    this.#handshakeTimeoutMs =
      options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
    this.#requestTimeoutMs = options.requestTimeoutMs;
    this.#token = options.token;
    this.#markEvent("bridge_started");
  }

  public acceptConnection(connection: BridgeConnection): void {
    if (
      this.#candidateConnection !== undefined ||
      this.#connection !== undefined
    ) {
      this.#markEvent("connection_rejected_already_connected");
      connection.close(1013, "An Aseprite extension is already connected");
      return;
    }

    this.#candidateConnection = connection;
    this.#markEvent("connection_accepted_waiting_for_hello");
    let authenticated = false;

    const handshakeTimeout = setTimeout(() => {
      this.#markEvent("handshake_timeout");
      connection.close(1008, "Bridge handshake timed out");
    }, this.#handshakeTimeoutMs);
    handshakeTimeout.unref();

    const unsubscribeMessage = connection.onMessage((message) => {
      if (!authenticated) {
        if (this.#candidateConnection !== connection) return;

        this.#markEvent("hello_received");

        const hello = this.#parseJson(message, bridgeHelloSchema);

        if (hello === undefined || !this.#tokenMatches(hello.token)) {
          this.#markEvent("hello_rejected");
          connection.close(1008, "Invalid bridge handshake");
          return;
        }

        authenticated = true;
        clearTimeout(handshakeTimeout);
        this.#candidateConnection = undefined;
        this.#connection = connection;
        this.#client = hello.client;
        this.#connectedAt = new Date();
        this.#markEvent("hello_accepted");
        this.#acknowledgeHello(connection);
        return;
      }

      const repeatedHello = this.#parseJson(message, bridgeHelloSchema);
      if (repeatedHello !== undefined) {
        if (!this.#tokenMatches(repeatedHello.token)) {
          this.#markEvent("repeated_hello_rejected");
          connection.close(1008, "Invalid repeated bridge handshake");
          return;
        }

        this.#markEvent("repeated_hello_acknowledged");
        this.#acknowledgeHello(connection);
        return;
      }

      this.#handleResponse(message, connection);
    });

    const unsubscribeClose = connection.onClose((info) => {
      clearTimeout(handshakeTimeout);
      unsubscribeMessage();
      unsubscribeClose();

      if (this.#candidateConnection === connection) {
        this.#candidateConnection = undefined;
        if (!authenticated) this.#markEvent("handshake_connection_closed");
      }

      if (this.#connection === connection) {
        this.#markEvent(
          `active_connection_closed:${info.code}:${info.reason || "no_reason"}`,
        );
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
      return {
        connected: false,
        lastEvent: this.#lastEvent,
        lastEventAt: this.#lastEventAt.toISOString(),
        phase:
          this.#candidateConnection === undefined
            ? "disconnected"
            : "handshaking",
        recentEvents: this.#serializedRecentEvents(),
      };
    }

    return {
      client: this.#client,
      connected: true,
      lastEvent: this.#lastEvent,
      lastEventAt: this.#lastEventAt.toISOString(),
      phase: "connected",
      recentEvents: this.#serializedRecentEvents(),
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

  #acknowledgeHello(connection: BridgeConnection): void {
    void connection
      .send(
        JSON.stringify({
          protocolVersion: BRIDGE_PROTOCOL_VERSION,
          type: "hello_accepted",
        }),
      )
      .catch((error: unknown) => {
        this.#markEvent(`hello_ack_failed:${String(error)}`);
        connection.close(1011, "Bridge handshake failed");
      });
  }

  #handleResponse(message: string, connection: BridgeConnection): void {
    const response = this.#parseJson(message, bridgeResponseSchema);

    if (response === undefined) {
      this.#markEvent("invalid_response_received");
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

  #markEvent(event: string): void {
    this.#lastEvent = event;
    this.#lastEventAt = new Date();
    this.#recentEvents.push({ at: this.#lastEventAt, event });
    this.#recentEvents = this.#recentEvents.slice(-10);
  }

  #serializedRecentEvents(): { at: string; event: string }[] {
    return this.#recentEvents.map(({ at, event }) => ({
      at: at.toISOString(),
      event,
    }));
  }
}
