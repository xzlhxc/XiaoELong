import { PointerEvent, useRef } from "react";
import type { MoodEmoji } from "@xiaoelong/shared";
import mascotImage from "../assets/xiaoelong-mascot-test.png";

interface AvatarDockProps {
  open: boolean;
  nickname: string;
  moodPrompt?: {
    options: MoodEmoji[];
    selectedMood: MoodEmoji | null;
    loading: boolean;
    onSelect: (emoji: MoodEmoji) => void | Promise<void>;
  };
  onToggle: () => void;
  onSettings: () => void;
}

export function AvatarDock(props: AvatarDockProps): JSX.Element {
  const dragRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    dragging: false
  });

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>): void {
    if (event.button !== 0) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    window.xiaoelongDesktop?.startDrag?.();
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>): void {
    if (dragRef.current.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragRef.current.startX;
    const deltaY = event.clientY - dragRef.current.startY;
    if (!dragRef.current.dragging && deltaX * deltaX + deltaY * deltaY > 25) {
      dragRef.current.dragging = true;
    }

    if (dragRef.current.dragging) {
      window.xiaoelongDesktop?.moveDrag?.();
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>): void {
    if (dragRef.current.pointerId !== event.pointerId) {
      return;
    }

    const wasDragging = dragRef.current.dragging;
    dragRef.current.pointerId = -1;
    event.currentTarget.releasePointerCapture(event.pointerId);
    window.xiaoelongDesktop?.endDrag?.();

    if (!wasDragging) {
      props.onToggle();
    }
  }

  return (
    <div className={`avatar-widget ${props.moodPrompt ? "has-mood-prompt" : ""}`}>
      {props.moodPrompt ? (
        <div className="avatar-mood-prompt" role="dialog" aria-label="每日心情">
          <span className="avatar-mood-title">今日心情</span>
          <div className="avatar-mood-options">
            {props.moodPrompt.options.map((emoji) => (
              <button
                type="button"
                className={props.moodPrompt?.selectedMood === emoji ? "selected" : ""}
                disabled={props.moodPrompt?.loading}
                key={emoji}
                onClick={() => {
                  void props.moodPrompt?.onSelect(emoji);
                }}
              >
                <span className="mood-emoji">{emoji}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        className={`avatar-dock ${props.open ? "open" : ""}`}
        aria-label={`${props.open ? "收起" : "展开"}小鳄龙面板，当前用户 ${props.nickname}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          dragRef.current.pointerId = -1;
          window.xiaoelongDesktop?.endDrag?.();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          dragRef.current.pointerId = -1;
          window.xiaoelongDesktop?.endDrag?.();
          props.onSettings();
        }}
      >
        <img src={mascotImage} alt="" className="avatar-dock-image" draggable={false} />
      </button>
    </div>
  );
}
