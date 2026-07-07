import { FormEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "@xiaoelong/shared";
import { UserAvatar } from "./UserAvatar";

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
  const [newMessageCount, setNewMessageCount] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const isAtBottomRef = useRef(true);
  const lastMessageIdRef = useRef<number | null>(null);

  const renderedMessages = useMemo(() => props.messages, [props.messages]);

  function scrollToBottom(behavior: ScrollBehavior = "auto"): void {
    const list = listRef.current;
    if (!list) {
      return;
    }
    list.scrollTo({
      top: list.scrollHeight,
      behavior
    });
    isAtBottomRef.current = true;
    setNewMessageCount(0);
  }

  function updateBottomState(): void {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const distanceToBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    const isAtBottom = distanceToBottom <= 28;
    isAtBottomRef.current = isAtBottom;
    if (isAtBottom) {
      setNewMessageCount(0);
    }
  }

  useLayoutEffect(() => {
    const latestMessage = renderedMessages[renderedMessages.length - 1] ?? null;
    const previousLastId = lastMessageIdRef.current;
    if (!latestMessage) {
      lastMessageIdRef.current = null;
      setNewMessageCount(0);
      return;
    }

    const isInitialLoad = previousLastId === null;
    const hasNewMessage = latestMessage.id !== previousLastId;
    lastMessageIdRef.current = latestMessage.id;

    if (!hasNewMessage) {
      return;
    }

    const latestIsMine = latestMessage.user.id === props.currentUserId;
    if (isInitialLoad || isAtBottomRef.current || latestIsMine) {
      scrollToBottom(isInitialLoad ? "auto" : "smooth");
      return;
    }

    setNewMessageCount((count) => count + 1);
  }, [renderedMessages, props.currentUserId]);

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
      <div className="module-head">
        <h2>群聊</h2>
      </div>
      <div className="chat-list" ref={listRef} onScroll={updateBottomState}>
        {renderedMessages.map((message) => {
          const isMine = message.user.id === props.currentUserId;
          return (
            <article className={`chat-item ${isMine ? "mine" : ""}`} key={message.id}>
              <UserAvatar user={message.user} />
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

      {newMessageCount > 0 ? (
        <button type="button" className="chat-new-message-pill" onClick={() => scrollToBottom("smooth")}>
          有新消息 {newMessageCount} 条
        </button>
      ) : null}

      <form onSubmit={handleSubmit} className="chat-form">
        <input
          type="text"
          placeholder="写点什么..."
          value={content}
          onChange={(event) => setContent(event.target.value)}
          maxLength={1000}
        />
        <button type="submit" disabled={sending}>
          {sending ? "发送中" : "发送"}
        </button>
      </form>
      {props.sendError ? <p className="error-text">{props.sendError}</p> : null}
    </section>
  );
}
