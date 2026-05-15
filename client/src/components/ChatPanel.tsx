import { FormEvent, useMemo, useState } from "react";
import type { ChatMessage } from "@xiaoelong/shared";
import { withServerUrl } from "../env";

interface ChatPanelProps {
  currentUserId: string;
  messages: ChatMessage[];
  sendError: string | null;
  onSendMessage: (content: string) => Promise<void>;
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function ChatPanel(props: ChatPanelProps): JSX.Element {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);

  const renderedMessages = useMemo(() => props.messages, [props.messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!content.trim()) {
      return;
    }

    setSending(true);
    try {
      await props.onSendMessage(content);
      setContent("");
    } catch {
      // Keep input content for retry when send fails.
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="chat-panel">
      <h2>群聊</h2>
      <div className="chat-list">
        {renderedMessages.map((message) => {
          const isMine = message.user.id === props.currentUserId;
          return (
            <article className={`chat-item ${isMine ? "mine" : ""}`} key={message.id}>
              {message.user.avatarUrl ? (
                <img src={withServerUrl(message.user.avatarUrl) || ""} alt={message.user.nickname} className="avatar" />
              ) : (
                <div className="avatar avatar-fallback">{message.user.nickname.slice(0, 1)}</div>
              )}
              <div className="bubble">
                <header>
                  <strong>{message.user.nickname}</strong>
                  <time>{formatTime(message.createdAt)}</time>
                </header>
                <p>{message.content}</p>
              </div>
            </article>
          );
        })}
      </div>

      <form onSubmit={handleSubmit} className="chat-form">
        <input
          type="text"
          placeholder="输入消息..."
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={1000}
        />
        <button type="submit" disabled={sending}>
          {sending ? "发送中..." : "发送"}
        </button>
      </form>
      {props.sendError ? <p className="error-text">{props.sendError}</p> : null}
    </section>
  );
}
