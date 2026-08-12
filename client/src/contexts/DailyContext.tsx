import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import {
  MOOD_OPTIONS,
  type DailyMoodTodayResponse,
  type DailyMoodUpdatePayload,
  type DailyQuestionTodayResponse,
  type DailyQuestionUpdatePayload,
  type MoodEmoji,
  type UserProfile,
  type UserUpdatePayload
} from "@xiaoelong/shared";
import { getTodayMood, getTodayQuestion, setTodayMood, submitTodayAnswer } from "../services/api";
import { getOrCreateSocket } from "../services/socket";
import { useAuth } from "./AuthContext";
import { useDesktop } from "./DesktopContext";

// ============================================================
// 类型定义
// ============================================================

export interface DailyState {
  dailyData: DailyQuestionTodayResponse | null;
  moodStatus: DailyMoodTodayResponse | null;
  dailyError: string | null;
  dailyLoading: boolean;
  moodLoading: boolean;
}

// ============================================================
// Action 类型
// ============================================================

export type DailyAction =
  | { type: "SET_DAILY_DATA"; payload: DailyQuestionTodayResponse | null }
  | { type: "SET_DAILY_LOADING"; payload: boolean }
  | { type: "SET_DAILY_ERROR"; payload: string | null }
  | { type: "UPDATE_DAILY_STATS"; payload: DailyQuestionUpdatePayload }
  | { type: "UPDATE_DAILY_VOTERS"; payload: UserProfile }
  | { type: "SET_MOOD_STATUS"; payload: DailyMoodTodayResponse | null }
  | { type: "UPDATE_MOOD_FROM_SOCKET"; payload: DailyMoodUpdatePayload }
  | { type: "SET_MOOD_LOADING"; payload: boolean }
  | { type: "CLEAR" };

// ============================================================
// 模块级辅助函数
// ============================================================

const DEFAULT_MOOD_OPTIONS: MoodEmoji[] = [...MOOD_OPTIONS];

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

// ============================================================
// 模块级初始值
// ============================================================

export function createInitialState(): DailyState {
  return {
    dailyData: null,
    moodStatus: null,
    dailyError: null,
    dailyLoading: false,
    moodLoading: false
  };
}

// ============================================================
// Reducer
// ============================================================

export function dailyReducer(state: DailyState, action: DailyAction): DailyState {
  switch (action.type) {
    case "SET_DAILY_DATA":
      return { ...state, dailyData: action.payload };

    case "SET_DAILY_LOADING":
      return { ...state, dailyLoading: action.payload };

    case "SET_DAILY_ERROR":
      return { ...state, dailyError: action.payload };

    case "UPDATE_DAILY_STATS":
      if (!state.dailyData || state.dailyData.question.id !== action.payload.questionId) {
        return state;
      }
      return { ...state, dailyData: { ...state.dailyData, stats: action.payload.stats } };

    case "UPDATE_DAILY_VOTERS":
      return { ...state, dailyData: applyUserUpdateToDailyData(state.dailyData, action.payload) };

    case "SET_MOOD_STATUS":
      return { ...state, moodStatus: action.payload };

    case "UPDATE_MOOD_FROM_SOCKET":
      return {
        ...state,
        moodStatus: {
          moodDay: action.payload.mood.moodDay,
          mood: action.payload.mood,
          options: state.moodStatus?.options ?? [...MOOD_OPTIONS],
          shouldPrompt: false
        }
      };

    case "SET_MOOD_LOADING":
      return { ...state, moodLoading: action.payload };

    case "CLEAR":
      return createInitialState();

    default:
      return state;
  }
}

// ============================================================
// Context
// ============================================================

export interface DailyContextValue extends DailyState {
  moodOptions: MoodEmoji[];
  answerDaily: (answerIndex: number) => Promise<void>;
  selectMood: (emoji: MoodEmoji) => Promise<void>;
  refreshDaily: (options?: { silent?: boolean }) => Promise<void>;
  clear: () => void;
}

const DailyContext = createContext<DailyContextValue | null>(null);

// ============================================================
// Provider
// ============================================================

export function DailyProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(dailyReducer, null, createInitialState);

  const { token, currentUserId, currentUser } = useAuth();
  const { desktopRole } = useDesktop();

  // ---- 数据加载 ----

  const loadDailyQuestion = useCallback(async (options?: { silent?: boolean }): Promise<void> => {
    if (!token) {
      return;
    }

    const silent = options?.silent ?? false;
    if (!silent) {
      dispatch({ type: "SET_DAILY_LOADING", payload: true });
      dispatch({ type: "SET_DAILY_ERROR", payload: null });
    }
    try {
      const today = await getTodayQuestion(token);
      dispatch({ type: "SET_DAILY_DATA", payload: today });
    } catch (error) {
      if (!silent) {
        dispatch({ type: "SET_DAILY_ERROR", payload: error instanceof Error ? error.message : "加载每日一题失败。" });
      }
    } finally {
      if (!silent) {
        dispatch({ type: "SET_DAILY_LOADING", payload: false });
      }
    }
  }, [token]);

  const loadTodayMood = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }

    try {
      const todayMood = await getTodayMood(token);
      dispatch({ type: "SET_MOOD_STATUS", payload: todayMood });
    } catch {
      dispatch({ type: "SET_MOOD_STATUS", payload: null });
    }
  }, [token]);

  useEffect(() => {
    if (!token || !currentUserId || desktopRole === "auth") {
      return;
    }

    void loadTodayMood();
    if (desktopRole !== "avatar") {
      void loadDailyQuestion();
    }
  }, [token, currentUserId, desktopRole, loadTodayMood, loadDailyQuestion]);

  // ---- 今日心情定时刷新：60s 轮询 + 网络恢复 + 窗口重新可见时刷新 ----

  useEffect(() => {
    if (!token || !currentUserId || desktopRole === "auth") {
      return;
    }

    let refreshInFlight = false;
    const refreshMood = (): void => {
      if (refreshInFlight) {
        return;
      }

      refreshInFlight = true;
      void loadTodayMood().finally(() => {
        refreshInFlight = false;
      });
    };
    const refreshWhenVisible = (): void => {
      if (document.visibilityState === "visible") {
        refreshMood();
      }
    };

    const timer = window.setInterval(refreshMood, 60_000);
    window.addEventListener("online", refreshMood);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", refreshMood);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [token, currentUserId, desktopRole, loadTodayMood]);

  // ---- Socket 连接 + 事件监听 ----

  useEffect(() => {
    if (!token || !currentUserId || desktopRole === "auth") {
      return;
    }

    const socket = getOrCreateSocket(token);

    const handleMoodUpdate = (payload: DailyMoodUpdatePayload): void => {
      if (payload.userId === currentUserId) {
        dispatch({ type: "UPDATE_MOOD_FROM_SOCKET", payload });
      }
    };
    const handleQuestionUpdate = (payload: DailyQuestionUpdatePayload): void => {
      dispatch({ type: "UPDATE_DAILY_STATS", payload });
    };
    const handleUserUpdate = (payload: UserUpdatePayload): void => {
      dispatch({ type: "UPDATE_DAILY_VOTERS", payload: payload.user });
    };

    socket.on("mood:update", handleMoodUpdate);
    if (desktopRole !== "avatar") {
      socket.on("question:update", handleQuestionUpdate);
      socket.on("user:update", handleUserUpdate);
    }

    return () => {
      socket.off("mood:update", handleMoodUpdate);
      if (desktopRole !== "avatar") {
        socket.off("question:update", handleQuestionUpdate);
        socket.off("user:update", handleUserUpdate);
      }
    };
  }, [token, currentUserId, desktopRole]);

  // ---- 每日一题轮询（60 秒，兜底刷新统计） ----

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

  // ---- 登出时重置 ----

  useEffect(() => {
    if (!token || !currentUserId) {
      dispatch({ type: "CLEAR" });
    }
  }, [token, currentUserId]);

  // ---- Handler ----

  const answerDaily = useCallback(
    async (answerIndex: number): Promise<void> => {
      const question = state.dailyData;
      if (!token || !question) {
        return;
      }

      dispatch({ type: "SET_DAILY_ERROR", payload: null });
      try {
        const result = await submitTodayAnswer(token, {
          questionId: question.question.id,
          answerIndex
        });
        dispatch({
          type: "SET_DAILY_DATA",
          payload: {
            ...question,
            answeredIndex: result.answeredIndex,
            stats: result.stats,
            result: result.result
          }
        });
      } catch (error) {
        dispatch({ type: "SET_DAILY_ERROR", payload: error instanceof Error ? error.message : "提交答案失败。" });
      }
    },
    [token, state.dailyData]
  );

  const selectMood = useCallback(
    async (emoji: MoodEmoji): Promise<void> => {
      if (!token) {
        return;
      }

      dispatch({ type: "SET_MOOD_LOADING", payload: true });
      try {
        const result = await setTodayMood(token, { emoji });
        dispatch({
          type: "SET_MOOD_STATUS",
          payload: {
            moodDay: result.moodDay,
            mood: result.mood,
            options: state.moodStatus?.options ?? DEFAULT_MOOD_OPTIONS,
            shouldPrompt: false
          }
        });
      } finally {
        dispatch({ type: "SET_MOOD_LOADING", payload: false });
      }
    },
    [token, state.moodStatus]
  );

  const refreshDaily = useCallback(
    async (options?: { silent?: boolean }): Promise<void> => {
      await loadDailyQuestion(options);
    },
    [loadDailyQuestion]
  );

  const clear = useCallback((): void => {
    dispatch({ type: "CLEAR" });
  }, []);

  // ---- 派生值 + Context value ----

  const moodOptions = useMemo<MoodEmoji[]>(
    () => state.moodStatus?.options ?? DEFAULT_MOOD_OPTIONS,
    [state.moodStatus]
  );

  const value = useMemo<DailyContextValue>(
    () => ({
      ...state,
      moodOptions,
      answerDaily,
      selectMood,
      refreshDaily,
      clear
    }),
    [state, moodOptions, answerDaily, selectMood, refreshDaily, clear]
  );

  return <DailyContext.Provider value={value}>{children}</DailyContext.Provider>;
}

// ============================================================
// Hook
// ============================================================

export function useDaily(): DailyContextValue {
  const ctx = useContext(DailyContext);
  if (!ctx) {
    throw new Error("useDaily must be used within DailyProvider");
  }
  return ctx;
}
