import { timingSafeEqual } from "node:crypto";

import type { RequestHandler } from "express";

function secretsEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function requireBearerToken(expectedToken: string): RequestHandler {
  return (request, response, next) => {
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
