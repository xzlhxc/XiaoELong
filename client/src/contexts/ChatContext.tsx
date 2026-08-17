import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import type { MutableRefObject } from "react";
import type {
  ChatFile,
  ChatImage,
  ChatMessage,
  DailyMood,
  DailyMoodUpdatePayload,
  PresenceDeltaPayload,
  PresenceInitPayload,
  PresenceUser,
  UserProfile,
  UserUpdatePayload
} from "@xiaoelong/shared";
import { ApiError, getRecentMessages, uploadChatFile, uploadChatImage } from "../services/api";
import { getOrCreateSocket, getSharedSocket } from "../services/socket";
import { useAuth } from "./AuthContext";
import { useDesktop } from "./DesktopContext";

// ============================================================
// 类型定义
// ============================================================

export interface ChatState {
  messages: ChatMessage[];
  presenceUsers: PresenceUser[];
  sendError: string | null;
  socketError: string | null;
  historyInitialized: boolean;
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;
  olderMessagesError: string | null;
}

export interface SendMessagePayload {
  content: string;
  imageFile: File | null;
  fileFile: File | null;
  replyToMessageId?: number | null;
}

/** ChatPanel 跨挂载的滚动位置记忆，由 Provider 常驻持有（切 tab 卸载后仍存活） */
export interface ChatScrollMemory {
  scrollTop: number;
  atBottom: boolean;
  anchorMessageId: number | null;
  anchorOffset: number;
  lastMessageId: number | null;
  firstUnreadMessageId: number | null;
  unreadCount: number;
}

// ============================================================
// Action 类型
// ============================================================

export type ChatAction =
  | { type: "START_HISTORY" }
  | { type: "SET_MESSAGES"; payload: ChatMessage[] }
  | { type: "SET_HISTORY_INITIALIZED"; payload: boolean }
  | { type: "START_OLDER_MESSAGES" }
  | { type: "FINISH_OLDER_MESSAGES"; payload: { hasMore: boolean; error: string | null } }
  | { type: "MERGE_MESSAGES"; payload: ChatMessage[] }
  | { type: "ADD_MESSAGE"; payload: ChatMessage }
  | { type: "SET_PRESENCE_USERS"; payload: PresenceUser[] }
  | { type: "UPDATE_PRESENCE_ONLINE"; payload: PresenceDeltaPayload }
  | { type: "UPDATE_PRESENCE_OFFLINE"; payload: string[] }
  | { type: "UPDATE_MOOD_IN_PRESENCE"; payload: { userId: string; mood: DailyMood } }
  | { type: "UPDATE_USER_IN_PRESENCE"; payload: UserProfile }
  | { type: "UPDATE_USER_IN_MESSAGES"; payload: UserProfile }
  | { type: "SET_SEND_ERROR"; payload: string | null }
  | { type: "SET_SOCKET_ERROR"; payload: string | null }
  | { type: "CLEAR" };

// ============================================================
// 模块级辅助函数
// ============================================================

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 401;
}

function dedupeMessages(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<number>();
  const deduped: ChatMessage[] = [];
  for (const message of messages) {
    if (seen.has(message.id)) {
      continue;
    }
    seen.add(message.id);
    deduped.push(message);
  }
  return deduped;
}

/**
 * 合并两组消息：按 id 去重（后者覆盖前者，取服务器最新数据），并按 id 升序排序。
 * 用于重连/网络恢复后补拉历史，把断线期间遗漏的消息补回现有列表，同时不截断已有历史。
 */
function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  const byId = new Map<number, ChatMessage>();
  for (const message of current) {
    byId.set(message.id, message);
  }
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}

function updatePresenceStatus(current: PresenceUser[], onlineUserIds: string[]): PresenceUser[] {
  const onlineSet = new Set(onlineUserIds);
  return current.map((user) => ({
    ...user,
    isOnline: onlineSet.has(user.id)
  }));
}

function applyPresenceDelta(current: PresenceUser[], payload: PresenceDeltaPayload): PresenceUser[] {
  const onlineSet = new Set(payload.onlineUserIds);
  const exists = current.some((user) => user.id === payload.userId);

  let next = current;
  if (!exists && payload.user) {
    next = [...current, { ...payload.user, isOnline: onlineSet.has(payload.user.id) }];
  }

  return next.map((user) => ({
    ...user,
    isOnline: onlineSet.has(user.id)
  }));
}

function applyMoodUpdate(current: PresenceUser[], userId: string, mood: DailyMood): PresenceUser[] {
  return current.map((user) => (user.id === userId ? { ...user, todayMood: mood } : user));
}

function applyUserUpdateToPresence(current: PresenceUser[], user: UserProfile): PresenceUser[] {
  return current.map((item) => (item.id === user.id ? { ...item, ...user } : item));
}

function applyUserUpdateToMessages(current: ChatMessage[], user: UserProfile): ChatMessage[] {
  return current.map((message) => {
    const updatesAuthor = message.user.id === user.id;
    const updatesReplyAuthor = message.replyTo?.user.id === user.id;
    if (!updatesAuthor && !updatesReplyAuthor) {
      return message;
    }

    return {
      ...message,
      user: updatesAuthor ? user : message.user,
      replyTo: updatesReplyAuthor && message.replyTo
        ? { ...message.replyTo, user }
        : message.replyTo
    };
  });
}

// ============================================================
// 模块级初始值
// ============================================================

export function createInitialState(): ChatState {
  return {
    messages: [],
    presenceUsers: [],
    sendError: null,
    socketError: null,
    historyInitialized: false,
    hasOlderMessages: true,
    loadingOlderMessages: false,
    olderMessagesError: null
  };
}

// ============================================================
// Reducer
// ============================================================

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "START_HISTORY":
      return {
        ...state,
        historyInitialized: false,
        loadingOlderMessages: false,
        olderMessagesError: null
      };

    case "SET_MESSAGES":
      return {
        ...state,
        messages: dedupeMessages([...action.payload, ...state.messages])
          .sort((left, right) => left.id - right.id),
        historyInitialized: true
      };

    case "SET_HISTORY_INITIALIZED":
      return { ...state, historyInitialized: action.payload };

    case "START_OLDER_MESSAGES":
      return { ...state, loadingOlderMessages: true, olderMessagesError: null };

    case "FINISH_OLDER_MESSAGES":
      return {
        ...state,
        hasOlderMessages: action.payload.hasMore,
        loadingOlderMessages: false,
        olderMessagesError: action.payload.error
      };

    case "MERGE_MESSAGES":
      return { ...state, messages: mergeMessages(state.messages, action.payload) };

    case "ADD_MESSAGE":
      return { ...state, messages: dedupeMessages([...state.messages, action.payload]) };

    case "SET_PRESENCE_USERS":
      return { ...state, presenceUsers: action.payload };

    case "UPDATE_PRESENCE_ONLINE":
      return { ...state, presenceUsers: applyPresenceDelta(state.presenceUsers, action.payload) };

    case "UPDATE_PRESENCE_OFFLINE":
      return { ...state, presenceUsers: updatePresenceStatus(state.presenceUsers, action.payload) };

    case "UPDATE_MOOD_IN_PRESENCE":
      return {
        ...state,
        presenceUsers: applyMoodUpdate(state.presenceUsers, action.payload.userId, action.payload.mood)
      };

    case "UPDATE_USER_IN_PRESENCE":
      return { ...state, presenceUsers: applyUserUpdateToPresence(state.presenceUsers, action.payload) };

    case "UPDATE_USER_IN_MESSAGES":
      return { ...state, messages: applyUserUpdateToMessages(state.messages, action.payload) };

    case "SET_SEND_ERROR":
      return { ...state, sendError: action.payload };

    case "SET_SOCKET_ERROR":
      return { ...state, socketError: action.payload };

    case "CLEAR":
      return createInitialState();

    default:
      return state;
  }
}

// ============================================================
// Context
// ============================================================

export interface ChatContextValue extends ChatState {
  sendMessage: (payload: SendMessagePayload) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  updateMoodForUser: (userId: string, mood: DailyMood) => void;
  clear: () => void;
  scrollMemoryRef: MutableRefObject<ChatScrollMemory | null>;
}

const ChatContext = createContext<ChatContextValue | null>(null);

// ============================================================
// Provider
// ============================================================

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(chatReducer, null, createInitialState);

  // ChatPanel 的滚动记忆 ref：Provider 常驻，切 tab 卸载后仍保留，跨挂载恢复滚动位置
  const scrollMemoryRef = useRef<ChatScrollMemory | null>(null);
  const messagesRef = useRef(state.messages);
  messagesRef.current = state.messages;
  const historySessionVersionRef = useRef(0);
  const olderHistoryInFlightRef = useRef(false);
  const historyUserIdRef = useRef<string | null>(null);

  const { token, currentUserId, currentUser, invalidateSession } = useAuth();
  const { desktopRole } = useDesktop();

  const clear = useCallback((): void => {
    historySessionVersionRef.current += 1;
    olderHistoryInFlightRef.current = false;
    scrollMemoryRef.current = null;
    dispatch({ type: "CLEAR" });
  }, []);

  const updateMoodForUser = useCallback((userId: string, mood: DailyMood): void => {
    dispatch({ type: "UPDATE_MOOD_IN_PRESENCE", payload: { userId, mood } });
  }, []);

  // ---- 聊天历史加载 ----

  useEffect(() => {
    if (!token || !currentUserId) {
      return;
    }

    const accountChanged = historyUserIdRef.current !== null && historyUserIdRef.current !== currentUserId;
    historyUserIdRef.current = currentUserId;
    const hadMessagesBeforeLoad = messagesRef.current.length > 0;
    historySessionVersionRef.current += 1;
    olderHistoryInFlightRef.current = false;
    let canceled = false;
    if (accountChanged) {
      scrollMemoryRef.current = null;
      dispatch({ type: "CLEAR" });
    }
    dispatch({ type: "START_HISTORY" });

    async function loadChatHistory(): Promise<void> {
      try {
        const history = await getRecentMessages(token!, 50);
        if (canceled) {
          return;
        }
        dispatch({ type: "SET_MESSAGES", payload: history.messages });
        if (accountChanged || !hadMessagesBeforeLoad) {
          dispatch({
            type: "FINISH_OLDER_MESSAGES",
            payload: {
              hasMore: history.hasMore ?? history.messages.length >= 50,
              error: null
            }
          });
        }
      } catch (error) {
        if (canceled) {
          return;
        }
        if (isUnauthorizedError(error)) {
          await invalidateSession(token!);
          return;
        }
        dispatch({ type: "SET_SOCKET_ERROR", payload: "聊天记录暂时未加载，实时连接仍会继续重试。" });
        dispatch({ type: "SET_HISTORY_INITIALIZED", payload: true });
      }
    }

    void loadChatHistory();
    return () => {
      canceled = true;
    };
  }, [token, currentUserId, invalidateSession]);

  const loadOlderMessages = useCallback(async (): Promise<void> => {
    if (!token || !currentUserId || olderHistoryInFlightRef.current || !state.hasOlderMessages) {
      return;
    }

    const oldestMessageId = messagesRef.current[0]?.id;
    if (!oldestMessageId) {
      return;
    }

    const requestVersion = historySessionVersionRef.current;
    olderHistoryInFlightRef.current = true;
    dispatch({ type: "START_OLDER_MESSAGES" });
    try {
      const history = await getRecentMessages(token, 50, oldestMessageId);
      if (requestVersion !== historySessionVersionRef.current) {
        return;
      }

      const olderMessages = history.messages.filter((message) => message.id < oldestMessageId);
      if (olderMessages.length > 0) {
        dispatch({ type: "MERGE_MESSAGES", payload: olderMessages });
      }

      // 旧服务端会忽略 beforeId。若没有任何更早 id，必须终止分页，避免在顶部反复请求同一页。
      const hasMore = olderMessages.length > 0
        && (history.hasMore ?? olderMessages.length >= 50);
      dispatch({ type: "FINISH_OLDER_MESSAGES", payload: { hasMore, error: null } });
    } catch (error) {
      if (requestVersion !== historySessionVersionRef.current) {
        return;
      }
      if (isUnauthorizedError(error)) {
        await invalidateSession(token);
        return;
      }
      dispatch({
        type: "FINISH_OLDER_MESSAGES",
        payload: { hasMore: true, error: "更早的消息暂时未加载，请稍后重试。" }
      });
    } finally {
      if (requestVersion === historySessionVersionRef.current) {
        olderHistoryInFlightRef.current = false;
      }
    }
  }, [token, currentUserId, state.hasOlderMessages, invalidateSession]);

  // ---- 当前用户资料变更同步到聊天与成员列表 ----

  useEffect(() => {
    if (!currentUser) {
      return;
    }
    dispatch({ type: "UPDATE_USER_IN_PRESENCE", payload: currentUser });
    dispatch({ type: "UPDATE_USER_IN_MESSAGES", payload: currentUser });
  }, [currentUser]);

  // ---- Socket 连接 + 事件监听 ----

  useEffect(() => {
    if (!token || !currentUserId || desktopRole === "auth") {
      return;
    }

    const socket = getOrCreateSocket(token);
    let canceled = false;
    let resyncInFlight = false;
    let resyncRequested = false;

    // 补拉最近历史并合并：用于重连/网络恢复后补齐断线期间遗漏的消息。
    // connect 与 online 可能相邻触发；正在补拉时记录一次尾随请求，避免把后一次恢复信号丢掉。
    const resyncRecentMessages = async (): Promise<void> => {
      if (desktopRole === "avatar" || canceled) {
        return;
      }

      resyncRequested = true;
      if (resyncInFlight) {
        return;
      }

      resyncInFlight = true;
      try {
        while (resyncRequested && !canceled) {
          resyncRequested = false;
          try {
            const history = await getRecentMessages(token, 50);
            if (canceled) {
              return;
            }
            dispatch({ type: "MERGE_MESSAGES", payload: history.messages });
          } catch (error) {
            if (canceled) {
              return;
            }
            if (isUnauthorizedError(error)) {
              resyncRequested = false;
              await invalidateSession(token);
              return;
            }
            // 普通网络/服务端错误不清空现有消息；若等待期间又收到恢复信号，循环会立即再试一次。
          }
        }
      } finally {
        resyncInFlight = false;
      }
    };

    const handleConnect = (): void => {
      dispatch({ type: "SET_SOCKET_ERROR", payload: null });
      void resyncRecentMessages();
    };
    const handleConnectError = (): void => {
      dispatch({ type: "SET_SOCKET_ERROR", payload: "实时连接失败，请稍后重试。" });
    };
    const handleDisconnect = (): void => {
      dispatch({ type: "SET_SOCKET_ERROR", payload: "实时连接已断开，正在重连。" });
    };
    const handlePresenceInit = (payload: PresenceInitPayload): void => {
      dispatch({ type: "SET_PRESENCE_USERS", payload: payload.users });
    };
    const handlePresenceOnline = (payload: PresenceDeltaPayload): void => {
      dispatch({ type: "UPDATE_PRESENCE_ONLINE", payload });
    };
    const handlePresenceOffline = (payload: PresenceDeltaPayload): void => {
      dispatch({ type: "UPDATE_PRESENCE_OFFLINE", payload: payload.onlineUserIds });
    };
    const handleUserUpdate = (payload: UserUpdatePayload): void => {
      dispatch({ type: "UPDATE_USER_IN_PRESENCE", payload: payload.user });
      dispatch({ type: "UPDATE_USER_IN_MESSAGES", payload: payload.user });
    };
    const handleMoodUpdate = (payload: DailyMoodUpdatePayload): void => {
      dispatch({ type: "UPDATE_MOOD_IN_PRESENCE", payload: { userId: payload.userId, mood: payload.mood } });
    };
    const handleChatMessage = (message: ChatMessage): void => {
      dispatch({ type: "ADD_MESSAGE", payload: message });
    };
    const handleOnline = (): void => {
      void resyncRecentMessages();
    };

    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);
    socket.on("disconnect", handleDisconnect);
    socket.on("presence:init", handlePresenceInit);
    socket.on("presence:online", handlePresenceOnline);
    socket.on("presence:offline", handlePresenceOffline);
    socket.on("user:update", handleUserUpdate);
    socket.on("mood:update", handleMoodUpdate);

    if (desktopRole !== "avatar") {
      socket.on("chat:message", handleChatMessage);
      window.addEventListener("online", handleOnline);
    }

    return () => {
      canceled = true;
      resyncRequested = false;
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      socket.off("disconnect", handleDisconnect);
      socket.off("presence:init", handlePresenceInit);
      socket.off("presence:online", handlePresenceOnline);
      socket.off("presence:offline", handlePresenceOffline);
      socket.off("user:update", handleUserUpdate);
      socket.off("mood:update", handleMoodUpdate);
      if (desktopRole !== "avatar") {
        socket.off("chat:message", handleChatMessage);
        window.removeEventListener("online", handleOnline);
      }
    };
  }, [token, currentUserId, desktopRole, invalidateSession]);

  // ---- 登出时重置 ----

  useEffect(() => {
    if (!token || !currentUserId) {
      historyUserIdRef.current = null;
      clear();
    }
  }, [token, currentUserId, clear]);

  // ---- Handler ----

  const sendMessage = useCallback(
    async (payload: SendMessagePayload): Promise<void> => {
      dispatch({ type: "SET_SEND_ERROR", payload: null });

      const socket = getSharedSocket();
      if (!socket) {
        dispatch({ type: "SET_SEND_ERROR", payload: "连接未建立，暂时无法发送。" });
        throw new Error("Socket not connected.");
      }

      if (!token) {
        dispatch({ type: "SET_SEND_ERROR", payload: "登录已失效，请重新打开小鳄龙。" });
        throw new Error("Missing token.");
      }

      try {
        if (payload.imageFile && payload.fileFile) {
          throw new Error("Only one attachment is allowed per message.");
        }

        let image: ChatImage | null = null;
        if (payload.imageFile) {
          const formData = new FormData();
          formData.append("image", payload.imageFile);
          const result = await uploadChatImage(token, formData);
          image = result.image;
        }

        let file: ChatFile | null = null;
        if (payload.fileFile) {
          const formData = new FormData();
          formData.append("file", payload.fileFile);
          const result = await uploadChatFile(token, formData);
          file = result.file;
        }

        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true;
              reject(new Error("Message send timeout."));
            }
          }, 5000);

          socket.emit("chat:send", {
            content: payload.content,
            image,
            file,
            replyToMessageId: payload.replyToMessageId
          }, (ack) => {
            if (settled) {
              return;
            }
            settled = true;
            clearTimeout(timer);

            if (!ack.ok) {
              reject(new Error(ack.error || "发送失败。"));
              return;
            }
            resolve();
          });
        });
      } catch (error) {
        dispatch({ type: "SET_SEND_ERROR", payload: error instanceof Error ? error.message : "发送失败。" });
        throw error;
      }
    },
    [token]
  );

  // ---- Context value ----

  const value = useMemo<ChatContextValue>(
    () => ({
      ...state,
      sendMessage,
      loadOlderMessages,
      updateMoodForUser,
      clear,
      scrollMemoryRef
    }),
    [state, sendMessage, loadOlderMessages, updateMoodForUser, clear, scrollMemoryRef]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

// ============================================================
// Hook
// ============================================================

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChat must be used within ChatProvider");
  }
  return ctx;
}
