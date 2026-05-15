import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

interface AccessTokenClaims {
  sub: string;
}

export function signAccessToken(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  const decoded = jwt.verify(token, env.JWT_SECRET);

  if (typeof decoded === "string" || !decoded.sub) {
    throw new Error("Invalid token payload.");
  }

  return { sub: String(decoded.sub) };
}
