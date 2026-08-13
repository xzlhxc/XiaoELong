import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_SESSION_VERSION } from "@xiaoelong/shared";
import { env } from "../config/env.js";

export interface AccessTokenClaims {
  sub: string;
  iat: number;
  exp: number;
  sessionVersion: number;
}

export const ACCESS_TOKEN_REFRESH_THRESHOLD_SECONDS = 7 * 24 * 60 * 60;

export function signAccessToken(userId: string): string {
  return jwt.sign({ sessionVersion: ACCESS_TOKEN_SESSION_VERSION }, env.JWT_SECRET, {
    subject: userId,
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const decoded = jwt.verify(token, env.JWT_SECRET);

  if (
    typeof decoded === "string" ||
    !decoded.sub ||
    typeof decoded.iat !== "number" ||
    !Number.isSafeInteger(decoded.iat) ||
    decoded.iat <= 0 ||
    typeof decoded.exp !== "number" ||
    !Number.isSafeInteger(decoded.exp) ||
    decoded.exp <= decoded.iat
  ) {
    throw new Error("Invalid token payload.");
  }

  return {
    sub: String(decoded.sub),
    iat: decoded.iat,
    exp: decoded.exp,
    sessionVersion:
      typeof decoded.sessionVersion === "number" && Number.isSafeInteger(decoded.sessionVersion)
        ? decoded.sessionVersion
        : 0
  };
}

export function shouldRefreshAccessToken(
  expiresAt: number,
  sessionVersion: number,
  issuedAt: number,
  now: number = Math.floor(Date.now() / 1000)
): boolean {
  const remainingSeconds = expiresAt - now;
  const tokenLifetimeSeconds = expiresAt - issuedAt;
  const refreshThresholdSeconds = Math.min(
    ACCESS_TOKEN_REFRESH_THRESHOLD_SECONDS,
    Math.max(1, Math.floor(tokenLifetimeSeconds / 2))
  );
  return (
    remainingSeconds > 0 &&
    (sessionVersion < ACCESS_TOKEN_SESSION_VERSION ||
      (sessionVersion === ACCESS_TOKEN_SESSION_VERSION &&
        remainingSeconds < refreshThresholdSeconds))
  );
}
