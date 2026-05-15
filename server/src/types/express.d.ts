import type { UserProfile } from "@xiaoelong/shared";

declare global {
  namespace Express {
    interface Request {
      user?: UserProfile;
    }
  }
}

export {};
