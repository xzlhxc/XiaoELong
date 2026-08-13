import type { UserProfile } from "@xiaoelong/shared";
import type { AccessTokenClaims } from "../utils/jwt.js";

declare global {
  namespace Express {
    interface Request {
      user?: UserProfile;
      accessTokenClaims?: AccessTokenClaims;
    }
  }
}

export {};
