import type { PresenceUser } from "@xiaoelong/shared";
import { withServerUrl } from "../env";

interface StatusBarProps {
  currentUserId: string;
  users: PresenceUser[];
}

export function StatusBar(props: StatusBarProps): JSX.Element {
  return (
    <section className="status-bar">
      <div className="status-header">
        <h2>成员在线状态</h2>
        <span>{props.users.filter((user) => user.isOnline).length} 在线</span>
      </div>
      <div className="status-list">
        {props.users.map((user) => (
          <div className="status-item" key={user.id}>
            <div className="avatar-wrap">
              {user.avatarUrl ? (
                <img src={withServerUrl(user.avatarUrl) || ""} alt={user.nickname} className="avatar" />
              ) : (
                <div className="avatar avatar-fallback">{user.nickname.slice(0, 1)}</div>
              )}
              <span className={`presence-dot ${user.isOnline ? "online" : "offline"}`} />
            </div>
            <div className="status-text">
              <strong>{user.nickname}</strong>
              {user.id === props.currentUserId ? <span>我</span> : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
