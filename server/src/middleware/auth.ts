import type { NextFunction, Request, Response } from "express";
import { getUserById } from "../db/users.js";
import { verifyAccessToken } from "../utils/jwt.js";

function getBearerToken(authorization?: string): string | null {
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = getBearerToken(req.headers.authorization);
  if (!token) {
    res.status(401).json({ message: "Unauthorized." });
    return;
  }

  let claims: ReturnType<typeof verifyAccessToken>;
  try {
    claims = verifyAccessToken(token);
  } catch {
    res.status(401).json({ message: "Unauthorized." });
    return;
  }

  try {
    const user = await getUserById(claims.sub);
    if (!user) {
      res.status(401).json({ message: "Unauthorized." });
      return;
    }

    req.user = user;
    req.accessTokenClaims = claims;
    next();
  } catch (error) {
    next(error);
  }
}
