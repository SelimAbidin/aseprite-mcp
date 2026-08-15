import * as z from "zod/v4";

import {
  DEFAULT_HOST,
  DEFAULT_PORT,
  DEFAULT_REQUEST_TIMEOUT_MS,
} from "./constants.js";

const environmentSchema = z.object({
  ASEPRITE_MCP_ALLOWED_DIRECTORIES: z.string().optional(),
  ASEPRITE_MCP_HOST: z.literal(DEFAULT_HOST).default(DEFAULT_HOST),
  ASEPRITE_MCP_LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
  ASEPRITE_MCP_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65_535)
    .default(DEFAULT_PORT),
  ASEPRITE_MCP_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(DEFAULT_REQUEST_TIMEOUT_MS),
  ASEPRITE_MCP_TOKEN: z.string().min(32).optional(),
});

export interface ServerConfig {
  readonly allowedDirectories: readonly string[];
  readonly host: typeof DEFAULT_HOST;
  readonly logLevel: "debug" | "info" | "warn" | "error";
  readonly port: number;
  readonly requestTimeoutMs: number;
  readonly token: string | undefined;
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig {
  const parsed = environmentSchema.parse(environment);
  const separator = process.platform === "win32" ? ";" : ":";

  return {
    allowedDirectories: (parsed.ASEPRITE_MCP_ALLOWED_DIRECTORIES ?? "")
      .split(separator)
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
    host: parsed.ASEPRITE_MCP_HOST,
    logLevel: parsed.ASEPRITE_MCP_LOG_LEVEL,
    port: parsed.ASEPRITE_MCP_PORT,
    requestTimeoutMs: parsed.ASEPRITE_MCP_REQUEST_TIMEOUT_MS,
    token: parsed.ASEPRITE_MCP_TOKEN,
  };
}
