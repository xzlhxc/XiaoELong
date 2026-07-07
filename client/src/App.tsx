import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  MOOD_OPTIONS,
  type ChatFile,
  type ChatImage,
  type ChatMessage,
  type DailyMood,
  type DailyMoodUpdatePayload,
  type DailyMoodTodayResponse,
  type DailyQuestionTodayResponse,
  type GomokuGame,
  type GomokuUpdatePayload,
  type MoodEmoji,
  type PresenceDeltaPayload,
  type PresenceUser,
  type UserProfile
} from "@xiaoelong/shared";
import {
  ApiError,
  deleteCurrentUser,
  getGomokuGames,
  getMe,
  getRecentMessages,
  getTodayQuestion,
  getTodayMood,
  joinWithInvite,
  setTodayMood,
  submitTodayAnswer,
  updateCurrentProfile,
  uploadChatFile,
  uploadChatImage
} from "./api";
import { AvatarDock } from "./components/AvatarDock";
import { ChatPanel } from "./components/ChatPanel";
import { DailyQuestionPanel } from "./components/DailyQuestionPanel";
import { GomokuPanel } from "./components/GomokuPanel";
import { JoinForm } from "./components/JoinForm";
import { SettingsProfileForm } from "./components/SettingsProfileForm";
import { StatusBar } from "./components/StatusBar";
import { connectSocket, type AppSocket } from "./socket";

const TOKEN_STORAGE_KEY = "xiaoelong_access_token";

type ModuleTab = "chat" | "daily" | "gomoku";
type DesktopRole = "auth" | "avatar" | "panel" | "single";
type PanelView = "home" | "settings";

interface DesktopSettingsState {
  openAtLogin: boolean;
  panelAlwaysOnTop: boolean;
}

function getDesktopRole(): DesktopRole {
  if (!window.xiaoelongDesktop?.isDesktop) {
    return "single";
  }

  const role = window.xiaoelongDesktop.role ?? new URLSearchParams(window.location.search).get("desktopRole");
  return role === "auth" || role === "avatar" || role === "panel" ? role : "auth";
}

function getInitialPanelView(): PanelView {
  const view = new URLSearchParams(window.location.search).get("desktopPanelView");
  return view === "settings" ? "settings" : "home";
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
  return current.map((message) => (message.user.id === user.id ? { ...message, user } : message));
}

function applyUserUpdateToGames(current: GomokuGame[], user: UserProfile): GomokuGame[] {
  return current.map((game) => ({
    ...game,
    playerBlack: game.playerBlack.id === user.id ? { ...game.playerBlack, ...user } : game.playerBlack,
    playerWhite: game.playerWhite.id === user.id ? { ...game.playerWhite, ...user } : game.playerWhite
  }));
}

function applyUserUpdateToDailyData(
  current: DailyQuestionTodayResponse | null,
  user: UserProfile
): DailyQuestionTodayResponse | null {
  if (!current) {
    return current;
  }

  return {
    ...current,
    stats: {
      ...current.stats,
      voters: current.stats.voters.map((group) =>
        group.map((voter) => (voter.id === user.id ? { ...voter, ...user } : voter))
      )
    }
  };
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
  const [moodStatus, setMoodStatus] = useState<DailyMoodTodayResponse | null>(null);
  const [moodPreviewOpen, setMoodPreviewOpen] = useState(false);
  const [gomokuGames, setGomokuGames] = useState<GomokuGame[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);

  const [booting, setBooting] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [accountDeleting, setAccountDeleting] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [moodLoading, setMoodLoading] = useState(false);
  const [gomokuError, setGomokuError] = useState<string | null>(null);
  const [gomokuLoading, setGomokuLoading] = useState(false);
  const [socketError, setSocketError] = useState<string | null>(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ModuleTab>("chat");
  const [panelView, setPanelView] = useState<PanelView>(() => getInitialPanelView());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [desktopSettings, setDesktopSettings] = useState<DesktopSettingsState>({
    openAtLogin: false,
    panelAlwaysOnTop: true
  });
  const desktopRole = getDesktopRole();

  const clearSession = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    socketRef.current?.disconnect();
    socketRef.current = null;
    setToken(null);
    setCurrentUser(null);
    setPresenceUsers([]);
    setMessages([]);
    setDailyData(null);
    setMoodStatus(null);
    setMoodPreviewOpen(false);
    setGomokuGames([]);
    setSelectedGameId(null);
    setPanelOpen(false);
    setPanelView("home");
    setDeleteConfirmOpen(false);
    setAccountDeleting(false);
    setProfileSaving(false);
    setProfileError(null);
    setProfileSaved(false);
    setSocketError(null);
  }, []);

  const loadDailyQuestion = useCallback(async (options?: { silent?: boolean }) => {
    if (!token) {
      return;
    }

    const silent = options?.silent ?? false;
    if (!silent) {
      setDailyLoading(true);
      setDailyError(null);
    }
    try {
      const today = await getTodayQuestion(token);
      setDailyData(today);
    } catch (error) {
      if (!silent) {
        setDailyError(error instanceof Error ? error.message : "加载每日一题失败。");
      }
    } finally {
      if (!silent) {
        setDailyLoading(false);
      }
    }
  }, [token]);

  const loadTodayMood = useCallback(async () => {
    if (!token) {
      return;
    }

    try {
      const todayMood = await getTodayMood(token);
      setMoodStatus(todayMood);
    } catch {
      setMoodStatus(null);
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
        setMoodStatus(null);
        setMoodPreviewOpen(false);
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
          setMoodStatus(null);
          setMoodPreviewOpen(false);
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
    if (!token || !currentUser || desktopRole === "auth") {
      return;
    }

    void loadTodayMood();

    if (desktopRole !== "avatar") {
      void loadDailyQuestion();
      void loadGomokuGames();
    }

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

    socket.on("user:update", (payload) => {
      setPresenceUsers((prev) => applyUserUpdateToPresence(prev, payload.user));
      setMessages((prev) => applyUserUpdateToMessages(prev, payload.user));
      setDailyData((prev) => applyUserUpdateToDailyData(prev, payload.user));
      setGomokuGames((prev) => applyUserUpdateToGames(prev, payload.user));
      setCurrentUser((prev) => (prev?.id === payload.user.id ? payload.user : prev));
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

    socket.on("mood:update", (payload: DailyMoodUpdatePayload) => {
      setPresenceUsers((prev) => applyMoodUpdate(prev, payload.userId, payload.mood));
      if (payload.userId === currentUser.id) {
        setMoodStatus((prev) => ({
          moodDay: payload.mood.moodDay,
          mood: payload.mood,
          options: prev?.options ?? [...MOOD_OPTIONS],
          shouldPrompt: false
        }));
      }
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
  }, [token, currentUser, desktopRole, loadTodayMood, loadDailyQuestion, loadGomokuGames, selectedGameId]);

  useEffect(() => {
    if (!token || !currentUser || desktopRole === "auth" || desktopRole === "avatar") {
      return;
    }

    const timer = window.setInterval(() => {
      void loadDailyQuestion({ silent: true });
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [token, currentUser, desktopRole, loadDailyQuestion]);

  useEffect(() => {
    if (!window.xiaoelongDesktop?.isDesktop) {
      return;
    }

    const cleanups: Array<() => void> = [];
    const panelViewCleanup = window.xiaoelongDesktop.onPanelViewChange?.((view) => {
      setPanelView(view);
    });
    const settingsCleanup = window.xiaoelongDesktop.onSettingsChange?.((settings) => {
      setDesktopSettings(settings);
    });
    const loginCleanup = window.xiaoelongDesktop.onLogin?.((nextToken) => {
      if (!nextToken) {
        return;
      }
      localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
      setToken(nextToken);
      setBooting(true);
    });
    const logoutCleanup = window.xiaoelongDesktop.onLogout?.(() => {
      clearSession();
    });
    const moodPreviewCleanup = window.xiaoelongDesktop.onMoodPreview?.(() => {
      setMoodPreviewOpen((prev) => !prev);
      void loadTodayMood();
    });

    if (panelViewCleanup) {
      cleanups.push(panelViewCleanup);
    }
    if (settingsCleanup) {
      cleanups.push(settingsCleanup);
    }
    if (loginCleanup) {
      cleanups.push(loginCleanup);
    }
    if (logoutCleanup) {
      cleanups.push(logoutCleanup);
    }
    if (moodPreviewCleanup) {
      cleanups.push(moodPreviewCleanup);
    }

    void window.xiaoelongDesktop.getSettings?.().then((settings) => {
      setDesktopSettings(settings);
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [clearSession, loadTodayMood]);

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
      window.xiaoelongDesktop?.notifyLogin?.(response.accessToken);
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

  async function handleUpdateProfile(payload: { nickname: string; avatarFile: File | null }): Promise<void> {
    if (!token) {
      setProfileError("登录已失效，请重新打开小鳄龙。");
      return;
    }

    const nickname = payload.nickname.trim();
    if (!nickname) {
      setProfileError("昵称不能为空。");
      return;
    }

    const formData = new FormData();
    formData.append("nickname", nickname);
    if (payload.avatarFile) {
      formData.append("avatar", payload.avatarFile);
    }

    setProfileSaving(true);
    setProfileError(null);
    setProfileSaved(false);

    try {
      const response = await updateCurrentProfile(token, formData);
      setCurrentUser((prev) => (prev?.id === response.user.id ? response.user : prev));
      setPresenceUsers((prev) => applyUserUpdateToPresence(prev, response.user));
      setMessages((prev) => applyUserUpdateToMessages(prev, response.user));
      setDailyData((prev) => applyUserUpdateToDailyData(prev, response.user));
      setGomokuGames((prev) => applyUserUpdateToGames(prev, response.user));
      setProfileSaved(true);
    } catch (error) {
      if (error instanceof ApiError) {
        setProfileError(error.message);
      } else {
        setProfileError("保存资料失败，请重试。");
      }
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleSendMessage(payload: { content: string; imageFile: File | null; fileFile: File | null }): Promise<void> {
    setSendError(null);

    const socket = socketRef.current;
    if (!socket) {
      setSendError("连接未建立，暂时无法发送。");
      throw new Error("Socket not connected.");
    }

    if (!token) {
      setSendError("登录已失效，请重新打开小鳄龙。");
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

        socket.emit("chat:send", { content: payload.content, image, file }, (ack) => {
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
      setSendError(error instanceof Error ? error.message : "发送失败。");
      throw error;
    }
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
              stats: result.stats,
              result: result.result
            }
          : prev
      );
    } catch (error) {
      setDailyError(error instanceof Error ? error.message : "提交答案失败。");
    }
  }

  async function handleSelectMood(emoji: MoodEmoji): Promise<void> {
    if (!token) {
      return;
    }

    setMoodLoading(true);
    try {
      const result = await setTodayMood(token, { emoji });
      setMoodStatus((prev) => ({
        moodDay: result.moodDay,
        mood: result.mood,
        options: prev?.options ?? [...MOOD_OPTIONS],
        shouldPrompt: false
      }));
      setPresenceUsers((prev) => applyMoodUpdate(prev, result.mood.userId, result.mood));
      setMoodPreviewOpen(false);
    } finally {
      setMoodLoading(false);
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

  function handleAvatarToggle(): void {
    const shouldCloseVisibleHome = panelView === "home" && panelOpen;
    setPanelView("home");
    if (window.xiaoelongDesktop?.toggleHomePanel) {
      setPanelOpen(!shouldCloseVisibleHome);
      window.xiaoelongDesktop.toggleHomePanel();
      return;
    }
    setPanelOpen((prev) => !prev);
  }

  function handleAvatarSettings(): void {
    const shouldCloseVisibleSettings = panelView === "settings" && panelOpen;
    setPanelView("settings");
    if (shouldCloseVisibleSettings) {
      setPanelOpen(false);
    }
    if (window.xiaoelongDesktop?.openSettingsPanel) {
      window.xiaoelongDesktop.openSettingsPanel();
      return;
    }
    setPanelOpen(true);
  }

  function handleHideAllWindows(): void {
    window.xiaoelongDesktop?.hideAllWindows?.();
  }

  async function handleToggleLoginAtStartup(): Promise<void> {
    const nextSettings = await window.xiaoelongDesktop?.setLoginAtStartup?.(!desktopSettings.openAtLogin);
    if (nextSettings) {
      setDesktopSettings(nextSettings);
    }
  }

  async function handleTogglePanelTopmost(): Promise<void> {
    const nextSettings = await window.xiaoelongDesktop?.setPanelAlwaysOnTop?.(!desktopSettings.panelAlwaysOnTop);
    if (nextSettings) {
      setDesktopSettings(nextSettings);
    }
  }

  function handlePreviewMoodPrompt(): void {
    setMoodPreviewOpen(true);
    void loadTodayMood();
    window.xiaoelongDesktop?.previewMoodPrompt?.();
  }

  async function handleDeleteAccount(): Promise<void> {
    if (!token) {
      if (window.xiaoelongDesktop?.requestLogout) {
        window.xiaoelongDesktop.requestLogout();
      }
      clearSession();
      return;
    }

    setAccountDeleting(true);
    try {
      await deleteCurrentUser(token);
      if (window.xiaoelongDesktop?.requestLogout) {
        window.xiaoelongDesktop.requestLogout();
      }
      clearSession();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "注销失败，请重试。");
    } finally {
      setAccountDeleting(false);
    }
  }

  useEffect(() => {
    if (!window.xiaoelongDesktop?.setWindowMode || desktopRole === "panel" || desktopRole === "avatar") {
      return;
    }
    if (booting || !currentUser) {
      window.xiaoelongDesktop.setWindowMode("auth");
      return;
    }
    if (desktopRole === "auth") {
      window.xiaoelongDesktop.setWindowMode("collapsed");
      return;
    }
    window.xiaoelongDesktop.setWindowMode(panelOpen ? "expanded" : "collapsed");
  }, [booting, currentUser, panelOpen, desktopRole]);

  useLayoutEffect(() => {
    if (desktopRole !== "panel" || booting || !currentUser) {
      return;
    }

    window.xiaoelongDesktop?.notifyPanelReady?.();
  }, [desktopRole, booting, currentUser, panelView, activeTab]);

  const moodOptions = moodStatus?.options ?? [...MOOD_OPTIONS];
  const moodPrompt =
    desktopRole === "avatar" && (moodStatus?.shouldPrompt || moodPreviewOpen)
      ? {
          options: moodOptions,
          selectedMood: moodStatus?.mood?.emoji ?? null,
          loading: moodLoading,
          onSelect: handleSelectMood
        }
      : undefined;
  const moodPromptVisible = Boolean(moodPrompt);

  useLayoutEffect(() => {
    if (desktopRole !== "avatar") {
      return;
    }

    window.xiaoelongDesktop?.setMoodPromptVisible?.(moodPromptVisible);
    return () => {
      window.xiaoelongDesktop?.setMoodPromptVisible?.(false);
    };
  }, [desktopRole, moodPromptVisible]);

  const homePanel = currentUser ? (
    <div className="panel">
      <header className="topbar">
        <h1>小鳄龙之家</h1>
      </header>

      {socketError ? <p className="error-text">{socketError}</p> : null}

      <StatusBar
        currentUserId={currentUser.id}
        users={presenceUsers}
        moodOptions={moodOptions}
        moodLoading={moodLoading}
        onSelectMood={handleSelectMood}
      />

      <nav className="module-tabs">
        <button type="button" className={activeTab === "chat" ? "active" : ""} onClick={() => setActiveTab("chat")}>
          聊天
        </button>
        <button type="button" className={activeTab === "daily" ? "active" : ""} onClick={() => setActiveTab("daily")}>
          每日一题
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
  ) : null;

  const settingsPanel = currentUser ? (
    <div className={`panel settings-panel ${deleteConfirmOpen ? "confirming" : ""}`}>
      <div className="settings-content">
        <SettingsProfileForm
          user={currentUser}
          loading={profileSaving}
          error={profileError}
          saved={profileSaved}
          onSubmit={handleUpdateProfile}
        />
      <header className="topbar settings-topbar">
        <div className="panel-action-buttons" aria-label="设置操作">
          <button type="button" className="ghost-button" onClick={handleHideAllWindows}>
            隐藏小鳄龙
          </button>
          <button
            type="button"
            className={desktopSettings.openAtLogin ? "primary-soft-button" : "ghost-button"}
            onClick={() => void handleToggleLoginAtStartup()}
          >
            {desktopSettings.openAtLogin ? "已开机自启" : "开机自启"}
          </button>
          <button
            type="button"
            className={desktopSettings.panelAlwaysOnTop ? "primary-soft-button" : "ghost-button"}
            onClick={() => void handleTogglePanelTopmost()}
          >
            {desktopSettings.panelAlwaysOnTop ? "已置顶" : "置顶"}
          </button>
          <button type="button" className="ghost-button" onClick={handlePreviewMoodPrompt}>
            预览心情
          </button>
          <button
            type="button"
            className="danger-button"
            disabled={accountDeleting}
            onClick={() => setDeleteConfirmOpen(true)}
          >
            {accountDeleting ? "注销中" : "注销"}
          </button>
        </div>
      </header>
      </div>

      {deleteConfirmOpen ? (
        <div className="settings-confirm-layer" role="dialog" aria-modal="true" aria-label="确认注销">
          <div className="settings-confirm-card">
            <p>注销将删除该user所有记录</p>
            <div className="settings-confirm-actions">
              <button
                type="button"
                className="ghost-button"
                disabled={accountDeleting}
                onClick={() => setDeleteConfirmOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={accountDeleting}
                onClick={() => void handleDeleteAccount()}
              >
                {accountDeleting ? "注销中" : "确定"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  ) : null;

  const panelContent = panelView === "settings" ? settingsPanel : homePanel;

  if (booting) {
    if (desktopRole === "avatar" || desktopRole === "panel") {
      return <main className="page shell-page empty-page" />;
    }

    return (
      <main className="page auth-page loading-page">
        <p>加载中...</p>
      </main>
    );
  }

  if (!currentUser) {
    if (desktopRole === "avatar" || desktopRole === "panel") {
      return <main className="page shell-page empty-page" />;
    }

    return (
      <main className="page auth-page">
        <JoinForm loading={authLoading} error={authError} onSubmit={handleJoin} />
      </main>
    );
  }

  if (desktopRole === "panel") {
    return <main className="page shell-page panel-page">{panelContent}</main>;
  }

  if (desktopRole === "avatar") {
    return (
      <main className="page shell-page avatar-page">
        <AvatarDock
          open={panelOpen}
          nickname={currentUser.nickname}
          moodPrompt={moodPrompt}
          onToggle={handleAvatarToggle}
          onSettings={handleAvatarSettings}
        />
      </main>
    );
  }

  return (
    <main className="page shell-page">
      <AvatarDock open={panelOpen} nickname={currentUser.nickname} onToggle={handleAvatarToggle} onSettings={handleAvatarSettings} />

      {panelOpen ? panelContent : null}
    </main>
  );
}
