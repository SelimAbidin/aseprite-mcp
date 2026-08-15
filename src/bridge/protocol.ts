import * as z from "zod/v4";

import { BRIDGE_PROTOCOL_VERSION } from "../constants.js";

export const bridgeClientSchema = z.object({
  apiVersion: z.number().int().nonnegative(),
  asepriteVersion: z.string().min(1),
  name: z.literal("aseprite-mcp-extension"),
  version: z.string().min(1),
});

export const bridgeHelloSchema = z.object({
  client: bridgeClientSchema,
  protocolVersion: z.literal(BRIDGE_PROTOCOL_VERSION),
  token: z.string().min(1).optional(),
  type: z.literal("hello"),
});

export const bridgeHelloAcceptedSchema = z.object({
  protocolVersion: z.literal(BRIDGE_PROTOCOL_VERSION),
  type: z.literal("hello_accepted"),
});

export const bridgeRequestSchema = z.object({
  id: z.string().min(1),
  method: z.string().min(1),
  params: z.record(z.string(), z.unknown()),
  protocolVersion: z.literal(BRIDGE_PROTOCOL_VERSION),
  type: z.literal("request"),
});

export const bridgeErrorSchema = z.object({
  code: z.string().min(1),
  details: z.record(z.string(), z.unknown()).optional(),
  message: z.string().min(1),
});

export const bridgeSuccessResponseSchema = z.object({
  id: z.string().min(1),
  ok: z.literal(true),
  protocolVersion: z.literal(BRIDGE_PROTOCOL_VERSION),
  result: z.unknown(),
  type: z.literal("response"),
});

export const bridgeErrorResponseSchema = z.object({
  error: bridgeErrorSchema,
  id: z.string().min(1),
  ok: z.literal(false),
  protocolVersion: z.literal(BRIDGE_PROTOCOL_VERSION),
  type: z.literal("response"),
});

export const bridgeResponseSchema = z.discriminatedUnion("ok", [
  bridgeSuccessResponseSchema,
  bridgeErrorResponseSchema,
]);

export type BridgeClient = z.infer<typeof bridgeClientSchema>;
export type BridgeHello = z.infer<typeof bridgeHelloSchema>;
export type BridgeHelloAccepted = z.infer<typeof bridgeHelloAcceptedSchema>;
export type BridgeRequest = z.infer<typeof bridgeRequestSchema>;
export type BridgeResponse = z.infer<typeof bridgeResponseSchema>;
