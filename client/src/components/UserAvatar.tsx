import { useEffect, useState } from "react";
import type { UserProfile } from "@xiaoelong/shared";
import { withServerUrl } from "../env";

interface UserAvatarProps {
  user: Pick<UserProfile, "nickname" | "avatarUrl">;
  className?: string;
  fallbackClassName?: string;
  dim?: boolean;
}

function cx(...values: Array<string | false | null | undefined>): string | undefined {
  const className = values.filter(Boolean).join(" ");
  return className || undefined;
}

export function UserAvatar({
  user,
  className = "avatar",
  fallbackClassName = "avatar avatar-fallback",
  dim = false
}: UserAvatarProps): JSX.Element {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [user.avatarUrl]);

  const initial = user.nickname.trim().slice(0, 1) || "?";
  const dimClass = dim ? "dim" : undefined;

  if (user.avatarUrl && !failed) {
    return (
      <img
        src={withServerUrl(user.avatarUrl) || ""}
        alt={user.nickname}
        className={cx(className, dimClass)}
        draggable={false}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className={cx(fallbackClassName, dimClass)} aria-label={user.nickname}>
      {initial}
    </span>
  );
}
