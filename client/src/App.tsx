import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChatMessage,
  DailyQuestionTodayResponse,
  GomokuGame,
  GomokuUpdatePayload,
  PresenceDeltaPayload,
  PresenceUser,
  UserProfile
} from "@xiaoelong/shared";
import {
  ApiError,
  getGomokuGames,
  getMe,
  getRecentMessages,
  getTodayQuestion,
  joinWithInvite,
  submitTodayAnswer
} from "./api";
import { AvatarDock } from "./components/AvatarDock";
import { ChatPanel } from "./components/ChatPanel";
import { DailyQuestionPanel } from "./components/DailyQuestionPanel";
import { GomokuPanel } from "./components/GomokuPanel";
import { JoinForm } from "./components/JoinForm";
import { StatusBar } from "./components/StatusBar";
import { connectSocket, type AppSocket } from "./socket";

const TOKEN_STORAGE_KEY = "xiaoelong_access_token";

type ModuleTab = "chat" | "daily" | "gomoku";

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

function upsertGame(list: GomokuGame[], game: GomokuGame): GomokuGame[] {
  const existingIndex = list.findIndex((item) => item.id === game.id);
  if (existingIndex === -1) {
    return [game, ...list].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  const next = [...list];
  next[existingIndex] = game;
  return next.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

async function emitWithAck<T>(
  socket: AppSocket,
  event: "gomoku:invite" | "gomoku:accept" | "gomoku:move",
  payload: Record<string, unknown>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`${event} timeout.`));
      }
    }, 8000);

    socket.emit(event, payload as never, (ack) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);

      if (!ack.ok) {
        reject(new Error(ack.error || `${event} failed.`));
        return;
      }
      resolve(ack as unknown as T);
    });
  });
}

export default function App(): JSX.Element {
  const socketRef = useRef<AppSocket | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [dailyData, setDailyData] = useState<DailyQuestionTodayResponse | null>(null);
  const [gomokuGames, setGomokuGames] = useState<GomokuGame[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);

  const [booting, setBooting] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [gomokuError, setGomokuError] = useState<string | null>(null);
  const [gomokuLoading, setGomokuLoading] = useState(false);
  const [socketError, setSocketError] = useState<string | null>(null);

  const [panelOpen, setPanelOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<ModuleTab>("chat");

  const loadDailyQuestion = useCallback(async () => {
    if (!token) {
      return;
    }

    setDailyLoading(true);
    setDailyError(null);
    try {
      const today = await getTodayQuestion(token);
      setDailyData(today);
    } catch (error) {
      setDailyError(error instanceof Error ? error.message : "加载每日问题失败。");
    } finally {
      setDailyLoading(false);
    }
  }, [token]);

  const loadGomokuGames = useCallback(async () => {
    if (!token) {
      return;
    }

    setGomokuLoading(true);
    setGomokuError(null);
    try {
      const result = await getGomokuGames(token);
      setGomokuGames(result.games);
      if (result.games.length > 0 && !selectedGameId) {
        setSelectedGameId(result.games[0].id);
      }
    } catch (error) {
      setGomokuError(error instanceof Error ? error.message : "加载五子棋对局失败。");
    } finally {
      setGomokuLoading(false);
    }
  }, [token, selectedGameId]);

  useEffect(() => {
    let canceled = false;

    async function bootstrapSession(): Promise<void> {
      if (!token) {
        setCurrentUser(null);
        setPresenceUsers([]);
        setMessages([]);
        setDailyData(null);
        setGomokuGames([]);
        setBooting(false);
        return;
      }

      setBooting(true);

      try {
        const meResponse = await getMe(token);
        if (canceled) {
          return;
        }

        setCurrentUser(meResponse.user);
        const history = await getRecentMessages(token, 50);
        if (canceled) {
          return;
        }
        setMessages(history.messages);
      } catch {
        if (!canceled) {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          setToken(null);
          setCurrentUser(null);
          setPresenceUsers([]);
          setMessages([]);
          setDailyData(null);
          setGomokuGames([]);
        }
      } finally {
        if (!canceled) {
          setBooting(false);
        }
      }
    }

    void bootstrapSession();
    return () => {
      canceled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !currentUser) {
      return;
    }

    void loadDailyQuestion();
    void loadGomokuGames();

    const socket = connectSocket(token);
    socketRef.current = socket;

    socket.on("connect", () => {
      setSocketError(null);
    });

    socket.on("connect_error", () => {
      setSocketError("实时连接失败，请稍后重试。");
    });

    socket.on("presence:init", (payload) => {
      setPresenceUsers(payload.users);
    });

    socket.on("presence:online", (payload) => {
      setPresenceUsers((prev) => applyPresenceDelta(prev, payload));
    });

    socket.on("presence:offline", (payload) => {
      setPresenceUsers((prev) => updatePresenceStatus(prev, payload.onlineUserIds));
    });

    socket.on("chat:message", (message) => {
      setMessages((prev) => dedupeMessages([...prev, message]));
    });

    socket.on("question:update", (payload) => {
      setDailyData((prev) => {
        if (!prev || prev.question.id !== payload.questionId) {
          return prev;
        }
        return {
          ...prev,
          stats: payload.stats
        };
      });
    });

    socket.on("gomoku:update", (payload: GomokuUpdatePayload) => {
      setGomokuGames((prev) => upsertGame(prev, payload.game));
      if (!selectedGameId) {
        setSelectedGameId(payload.game.id);
      }
    });

    socket.on("gomoku:end", (payload) => {
      setGomokuGames((prev) => upsertGame(prev, payload.game));
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocketError(null);
    };
  }, [token, currentUser, loadDailyQuestion, loadGomokuGames, selectedGameId]);

  async function handleJoin(payload: {
    inviteCode: string;
    nickname: string;
    avatarFile: File | null;
  }): Promise<void> {
    setAuthLoading(true);
    setAuthError(null);

    const formData = new FormData();
    formData.append("inviteCode", payload.inviteCode);
    formData.append("nickname", payload.nickname);
    if (payload.avatarFile) {
      formData.append("avatar", payload.avatarFile);
    }

    try {
      const response = await joinWithInvite(formData);
      localStorage.setItem(TOKEN_STORAGE_KEY, response.accessToken);
      setToken(response.accessToken);
      setCurrentUser(response.user);
      setBooting(true);
    } catch (error) {
      if (error instanceof ApiError) {
        setAuthError(error.message);
      } else {
        setAuthError("加入失败，请重试。");
      }
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSendMessage(content: string): Promise<void> {
    setSendError(null);

    const socket = socketRef.current;
    if (!socket) {
      setSendError("连接未建立，暂时无法发送。");
      throw new Error("Socket not connected.");
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          reject(new Error("Message send timeout."));
        }
      }, 5000);

      socket.emit("chat:send", { content }, (ack) => {
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
    }).catch((error) => {
      setSendError(error instanceof Error ? error.message : "发送失败。");
      throw error;
    });
  }

  async function handleAnswerDaily(answerIndex: number): Promise<void> {
    if (!token || !dailyData) {
      return;
    }

    setDailyError(null);
    try {
      const result = await submitTodayAnswer(token, {
        questionId: dailyData.question.id,
        answerIndex
      });
      setDailyData((prev) =>
        prev
          ? {
              ...prev,
              answeredIndex: result.answeredIndex,
              stats: result.stats
            }
          : prev
      );
    } catch (error) {
      setDailyError(error instanceof Error ? error.message : "提交答案失败。");
    }
  }

  async function handleInviteGomoku(targetUserId: string): Promise<void> {
    const socket = socketRef.current;
    if (!socket) {
      setGomokuError("连接未建立，无法发起邀请。");
      return;
    }

    setGomokuError(null);
    try {
      const result = await emitWithAck<{ game: GomokuGame }>(socket, "gomoku:invite", { targetUserId });
      setGomokuGames((prev) => upsertGame(prev, result.game));
      setSelectedGameId(result.game.id);
    } catch (error) {
      setGomokuError(error instanceof Error ? error.message : "发起邀请失败。");
    }
  }

  async function handleAcceptGomoku(gameId: number): Promise<void> {
    const socket = socketRef.current;
    if (!socket) {
      setGomokuError("连接未建立，无法接受邀请。");
      return;
    }

    setGomokuError(null);
    try {
      const result = await emitWithAck<{ game: GomokuGame }>(socket, "gomoku:accept", { gameId });
      setGomokuGames((prev) => upsertGame(prev, result.game));
      setSelectedGameId(result.game.id);
    } catch (error) {
      setGomokuError(error instanceof Error ? error.message : "接受邀请失败。");
    }
  }

  async function handleMoveGomoku(gameId: number, row: number, col: number): Promise<void> {
    const socket = socketRef.current;
    if (!socket) {
      setGomokuError("连接未建立，无法落子。");
      return;
    }

    setGomokuError(null);
    try {
      const result = await emitWithAck<{ game: GomokuGame }>(socket, "gomoku:move", { gameId, row, col });
      setGomokuGames((prev) => upsertGame(prev, result.game));
    } catch (error) {
      setGomokuError(error instanceof Error ? error.message : "落子失败。");
    }
  }

  const onlineCount = useMemo(
    () => presenceUsers.filter((user) => user.isOnline).length,
    [presenceUsers]
  );

  if (booting) {
    return (
      <main className="page loading-page">
        <p>加载中...</p>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="page">
        <JoinForm loading={authLoading} error={authError} onSubmit={handleJoin} />
      </main>
    );
  }

  return (
    <main className="page shell-page">
      <AvatarDock open={panelOpen} nickname={currentUser.nickname} onToggle={() => setPanelOpen((prev) => !prev)} />

      {panelOpen ? (
        <div className="panel">
          <header className="topbar">
            <div>
              <h1>小鳄龙群组伴侣</h1>
              <p>你好，{currentUser.nickname}</p>
            </div>
            <div className="badge">{onlineCount} 人在线</div>
          </header>

          {socketError ? <p className="error-text">{socketError}</p> : null}

          <StatusBar currentUserId={currentUser.id} users={presenceUsers} />

          <nav className="module-tabs">
            <button type="button" className={activeTab === "chat" ? "active" : ""} onClick={() => setActiveTab("chat")}>
              聊天
            </button>
            <button type="button" className={activeTab === "daily" ? "active" : ""} onClick={() => setActiveTab("daily")}>
              每日问题
            </button>
            <button type="button" className={activeTab === "gomoku" ? "active" : ""} onClick={() => setActiveTab("gomoku")}>
              五子棋
            </button>
          </nav>

          {activeTab === "chat" ? (
            <ChatPanel
              currentUserId={currentUser.id}
              messages={messages}
              sendError={sendError}
              onSendMessage={handleSendMessage}
            />
          ) : null}

          {activeTab === "daily" ? (
            <DailyQuestionPanel
              data={dailyData}
              loading={dailyLoading}
              error={dailyError}
              onRefresh={loadDailyQuestion}
              onAnswer={handleAnswerDaily}
            />
          ) : null}

          {activeTab === "gomoku" ? (
            <GomokuPanel
              currentUser={currentUser}
              users={presenceUsers}
              games={gomokuGames}
              selectedGameId={selectedGameId}
              loading={gomokuLoading}
              error={gomokuError}
              onRefresh={loadGomokuGames}
              onSelectGame={setSelectedGameId}
              onInvite={handleInviteGomoku}
              onAccept={handleAcceptGomoku}
              onMove={handleMoveGomoku}
            />
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
