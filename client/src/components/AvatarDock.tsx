interface AvatarDockProps {
  open: boolean;
  nickname: string;
  onToggle: () => void;
}

export function AvatarDock(props: AvatarDockProps): JSX.Element {
  return (
    <button type="button" className={`avatar-dock ${props.open ? "open" : ""}`} onClick={props.onToggle}>
      <span className="avatar-dock-badge">{props.open ? "收起" : "展开"}</span>
      <span className="avatar-dock-face">{props.nickname.slice(0, 1)}</span>
      <span className="avatar-dock-title">小鳄龙</span>
    </button>
  );
}
