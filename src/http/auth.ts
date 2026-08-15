import type { RequestHandler } from "express";

import { secretsEqual } from "../security/secrets.js";

export function requireBearerToken(
  expectedToken: string | undefined,
): RequestHandler {
  return (request, response, next) => {
    if (expectedToken === undefined) {
      next();
      return;
    }

    const authorization = request.header("authorization");
    const prefix = "Bearer ";

    if (
      authorization === undefined ||
      !authorization.startsWith(prefix) ||
      !secretsEqual(authorization.slice(prefix.length), expectedToken)
    ) {
      response.status(401).json({ error: "unauthorized" });
      return;
    }

    next();
  };
}
