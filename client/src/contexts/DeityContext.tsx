import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";
import {
  type DeityId,
  type DeityWorshipResponse,
  type DeityWorshipTodayResponse,
  type DeityWorshipUpdatePayload
} from "@xiaoelong/shared";
import { ApiError, getTodayDeityWorship, submitDeityWorship } from "../services/api";
import { getOrCreateSocket } from "../services/socket";
import { useAuth } from "./AuthContext";
import { useDesktop } from "./DesktopContext";

// ============================================================
// 类型定义
// ============================================================

export interface DeityState {
  deityData: DeityWorshipTodayResponse | null;
  deityError: string | null;
  deityLoading: boolean;
  deitySubmittingId: DeityId | null;
  divineViewSession: number;
  divineRevealRequestId: number;
}

// ============================================================
// Action 类型
// ============================================================

export type DeityAction =
  | { type: "SET_DEITY_DATA"; payload: DeityWorshipTodayResponse | null }
  | { type: "SET_DEITY_LOADING"; payload: boolean }
  | { type: "SET_DEITY_ERROR"; payload: string | null }
  | { type: "SET_DEITY_SUBMITTING_ID"; payload: DeityId | null }
  | { type: "UPDATE_DEITY_STATUS"; payload: DeityWorshipUpdatePayload }
  | { type: "SET_DIVINE_VIEW_SESSION"; payload: number }
  | { type: "INCREMENT_DIVINE_VIEW_SESSION" }
  | { type: "SET_DIVINE_REVEAL_REQUEST_ID"; payload: number }
  | { type: "CLEAR" };

// ============================================================
// 模块级初始值
// ============================================================

interface InitialDivineSession {
  requestId: number;
  data: DeityWorshipTodayResponse | null;
}

function getInitialDivineSession(): InitialDivineSession {
  if (window.xiaoelongDesktop?.role !== "divine") {
    return { requestId: 0, data: null };
  }
  return window.xiaoelongDesktop.getInitialDivineSession?.() ?? {
    requestId: 0,
    data: window.xiaoelongDesktop.getInitialDivineData?.() ?? null
  };
}

const INITIAL_DIVINE_SESSION = getInitialDivineSession();

function createClearedState(): DeityState {
  return {
    deityData: null,
    deityError: null,
    deityLoading: false,
    deitySubmittingId: null,
    divineViewSession: 0,
    divineRevealRequestId: 0
  };
}

export function createInitialState(): DeityState {
  return {
    ...createClearedState(),
    deityData: INITIAL_DIVINE_SESSION.data,
    divineRevealRequestId: INITIAL_DIVINE_SESSION.requestId
  };
}

// ============================================================
// Reducer
// ============================================================

export function deityReducer(state: DeityState, action: DeityAction): DeityState {
  switch (action.type) {
    case "SET_DEITY_DATA":
      return { ...state, deityData: action.payload };

    case "SET_DEITY_LOADING":
      return { ...state, deityLoading: action.payload };

    case "SET_DEITY_ERROR":
      return { ...state, deityError: action.payload };

    case "SET_DEITY_SUBMITTING_ID":
      return { ...state, deitySubmittingId: action.payload };

    case "UPDATE_DEITY_STATUS":
      if (!state.deityData) {
        return state;
      }
      return {
        ...state,
        deityData: {
          ...state.deityData,
          deities: state.deityData.deities.map((deity) =>
            deity.deityId === action.payload.deity.deityId ? action.payload.deity : deity
          )
        }
      };

    case "SET_DIVINE_VIEW_SESSION":
      return { ...state, divineViewSession: action.payload };

    case "INCREMENT_DIVINE_VIEW_SESSION":
      return { ...state, divineViewSession: state.divineViewSession + 1 };

    case "SET_DIVINE_REVEAL_REQUEST_ID":
      return { ...state, divineRevealRequestId: action.payload };

    case "CLEAR":
      return createClearedState();

    default:
      return state;
  }
}

// ============================================================
// Context
// ============================================================

export interface DeityContextValue extends DeityState {
  worship: (deityId: DeityId) => Promise<DeityWorshipResponse | null>;
  selectDivineTab: () => Promise<void>;
  clear: () => void;
}

const DeityContext = createContext<DeityContextValue | null>(null);

// ============================================================
// 模块级辅助函数
// ============================================================

function scheduleAfterNextPaint(callback: () => void): () => void {
  let secondFrame: number | null = null;
  const firstFrame = window.requestAnimationFrame(() => {
    secondFrame = window.requestAnimationFrame(callback);
  });

  return () => {
    window.cancelAnimationFrame(firstFrame);
    if (secondFrame !== null) {
      window.cancelAnimationFrame(secondFrame);
    }
  };
}

// ============================================================
// Provider
// ============================================================

export function DeityProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(deityReducer, null, createInitialState);

  const { token, currentUser, currentUserId, booting } = useAuth();
  const { desktopRole, activeTab, setActiveTab } = useDesktop();

  const deityDataVersionRef = useRef(0);
  const sessionEpochRef = useRef(0);
  const sessionIdentityRef = useRef({ token, userId: currentUserId });
  const previousSessionIdentity = sessionIdentityRef.current;
  const tokenChanged = previousSessionIdentity.token !== token;
  const userChanged = previousSessionIdentity.userId !== currentUserId;
  const isInitialUserResolution =
    !tokenChanged && previousSessionIdentity.userId === null && currentUserId !== null;
  if (tokenChanged || (userChanged && !isInitialUserResolution)) {
    sessionEpochRef.current += 1;
    deityDataVersionRef.current += 1;
  }
  sessionIdentityRef.current = { token, userId: currentUserId };
  const sessionEpoch = sessionEpochRef.current;
  const clearedSessionEpochRef = useRef(sessionEpoch);
  const appliedDivineSessionRequestIdRef = useRef(INITIAL_DIVINE_SESSION.requestId);

  // ---- 数据加载 ----

  const loadDeityWorship = useCallback(
    async (options?: { silent?: boolean }): Promise<DeityWorshipTodayResponse | null> => {
      if (
        !token ||
        !currentUserId ||
        sessionIdentityRef.current.token !== token ||
        sessionIdentityRef.current.userId !== currentUserId
      ) {
        return null;
      }

      const requestSessionEpoch = sessionEpochRef.current;
      const dataVersion = deityDataVersionRef.current;
      const isRequestCurrent = (): boolean =>
        requestSessionEpoch === sessionEpochRef.current &&
        dataVersion === deityDataVersionRef.current;
      const silent = options?.silent ?? false;
      if (!silent) {
        dispatch({ type: "SET_DEITY_LOADING", payload: true });
        dispatch({ type: "SET_DEITY_ERROR", payload: null });
      }
      try {
        const today = await getTodayDeityWorship(token);
        if (!isRequestCurrent()) {
          return null;
        }
        dispatch({ type: "SET_DEITY_DATA", payload: today });
        dispatch({ type: "SET_DEITY_ERROR", payload: null });
        return today;
      } catch (error) {
        if (!silent && isRequestCurrent()) {
          dispatch({
            type: "SET_DEITY_ERROR",
            payload: error instanceof Error ? error.message : "加载神选状态失败。"
          });
        }
        return null;
      } finally {
        if (!silent && isRequestCurrent()) {
          dispatch({ type: "SET_DEITY_LOADING", payload: false });
        }
      }
    },
    [token, currentUserId]
  );

  // ---- ① 数据加载（非 auth/avatar 角色） ----

  useEffect(() => {
    if (!token || !currentUserId || desktopRole === "auth" || desktopRole === "avatar") {
      return;
    }
    void loadDeityWorship();
  }, [token, currentUserId, desktopRole, loadDeityWorship]);

  // ---- ② onDivineData 监听（divine 角色 IPC 推送，requestId 去重） ----

  useEffect(() => {
    if (desktopRole !== "divine") {
      return;
    }

    return window.xiaoelongDesktop?.onDivineData?.((session) => {
      if (
        session.requestId <= 0 ||
        session.requestId === appliedDivineSessionRequestIdRef.current
      ) {
        return;
      }
      appliedDivineSessionRequestIdRef.current = session.requestId;
      deityDataVersionRef.current += 1;
      dispatch({ type: "SET_DEITY_DATA", payload: session.data });
      dispatch({ type: "SET_DEITY_ERROR", payload: null });
      dispatch({ type: "SET_DEITY_LOADING", payload: false });
      dispatch({ type: "SET_DEITY_SUBMITTING_ID", payload: null });
      dispatch({ type: "INCREMENT_DIVINE_VIEW_SESSION" });
      dispatch({ type: "SET_DIVINE_REVEAL_REQUEST_ID", payload: session.requestId });
    });
  }, [desktopRole]);

  // ---- ③ updateDivineSelectionData 同步（divine 数据变化推回 Electron） ----

  useEffect(() => {
    if (desktopRole === "divine" && state.deityData) {
      window.xiaoelongDesktop?.updateDivineSelectionData?.(state.deityData);
    }
  }, [state.deityData, desktopRole]);

  // ---- ④ notifyDivineReady（渲染两帧后通知 Electron 显示窗口） ----

  useLayoutEffect(() => {
    if (
      desktopRole !== "divine" ||
      booting ||
      !currentUser ||
      state.divineRevealRequestId <= 0
    ) {
      return;
    }
    return scheduleAfterNextPaint(() => {
      window.xiaoelongDesktop?.notifyDivineReady?.(state.divineRevealRequestId);
    });
  }, [booting, currentUser, desktopRole, state.divineRevealRequestId, state.divineViewSession]);

  // ---- ⑤ Socket 监听（deity:worship 实时替换单个 deity） ----

  useEffect(() => {
    if (!token || !currentUserId || desktopRole === "auth" || desktopRole === "avatar") {
      return;
    }

    const socket = getOrCreateSocket(token);
    const listenerIdentity = { token, userId: currentUserId };

    const handleDeityWorship = (payload: DeityWorshipUpdatePayload): void => {
      if (
        listenerIdentity.token !== sessionIdentityRef.current.token ||
        listenerIdentity.userId !== sessionIdentityRef.current.userId
      ) {
        return;
      }
      deityDataVersionRef.current += 1;
      dispatch({ type: "UPDATE_DEITY_STATUS", payload });
    };

    socket.on("deity:worship", handleDeityWorship);

    return () => {
      socket.off("deity:worship", handleDeityWorship);
    };
  }, [token, currentUserId, desktopRole]);

  // ---- ⑥ 60s 轮询（activeTab === "divine"） ----

  useEffect(() => {
    if (
      !token ||
      !currentUser ||
      desktopRole === "auth" ||
      desktopRole === "avatar" ||
      activeTab !== "divine"
    ) {
      return;
    }

    void loadDeityWorship({ silent: true });
    const timer = window.setInterval(() => {
      void loadDeityWorship({ silent: true });
    }, 60_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [token, currentUser, desktopRole, activeTab, loadDeityWorship]);

  // ---- ⑦ onDivineReturn（全屏返回，推回数据后静默重拉） ----

  useEffect(() => {
    if (!window.xiaoelongDesktop?.isDesktop) {
      return;
    }

    return window.xiaoelongDesktop.onDivineReturn?.((divineState) => {
      if (!sessionIdentityRef.current.token || !sessionIdentityRef.current.userId) {
        return;
      }
      if (divineState.data) {
        deityDataVersionRef.current += 1;
        dispatch({ type: "SET_DEITY_DATA", payload: divineState.data });
      }
      void loadDeityWorship({ silent: true });
    });
  }, [loadDeityWorship]);

  // ---- ⑧ 登出清理 ----

  useEffect(() => {
    const sessionChanged = clearedSessionEpochRef.current !== sessionEpoch;
    if (sessionChanged || !token || (!booting && !currentUserId)) {
      clearedSessionEpochRef.current = sessionEpoch;
      dispatch({ type: "CLEAR" });
    }
  }, [token, currentUserId, booting, sessionEpoch]);

  // ---- Handler ----

  const worship = useCallback(
    async (deityId: DeityId): Promise<DeityWorshipResponse | null> => {
      if (
        !token ||
        !currentUserId ||
        sessionIdentityRef.current.token !== token ||
        sessionIdentityRef.current.userId !== currentUserId ||
        state.deitySubmittingId !== null
      ) {
        return null;
      }

      const requestSessionEpoch = sessionEpochRef.current;
      const isSessionCurrent = (): boolean => requestSessionEpoch === sessionEpochRef.current;
      dispatch({ type: "SET_DEITY_SUBMITTING_ID", payload: deityId });
      dispatch({ type: "SET_DEITY_ERROR", payload: null });
      try {
        const result = await submitDeityWorship(token, { deityId });
        if (!isSessionCurrent()) {
          return null;
        }
        deityDataVersionRef.current += 1;
        dispatch({ type: "SET_DEITY_DATA", payload: result });
        window.xiaoelongDesktop?.updateDivineSelectionData?.(result);
        return result;
      } catch (error) {
        if (error instanceof ApiError && error.statusCode === 409) {
          if (!isSessionCurrent()) {
            return null;
          }
          await loadDeityWorship({ silent: true });
          if (isSessionCurrent()) {
            dispatch({ type: "SET_DEITY_ERROR", payload: null });
          }
          return null;
        }
        if (isSessionCurrent()) {
          dispatch({
            type: "SET_DEITY_ERROR",
            payload: error instanceof Error ? error.message : "膜拜失败，请稍后重试。"
          });
        }
        return null;
      } finally {
        if (isSessionCurrent()) {
          dispatch({ type: "SET_DEITY_SUBMITTING_ID", payload: null });
        }
      }
    },
    [token, currentUserId, state.deitySubmittingId, loadDeityWorship]
  );

  const selectDivineTab = useCallback(
    async (): Promise<void> => {
      setActiveTab("divine");
      const latest = await loadDeityWorship({ silent: true });
      if (
        desktopRole === "panel" &&
        latest &&
        latest.todayWorship === null &&
        window.xiaoelongDesktop?.openDivineSelection
      ) {
        void window.xiaoelongDesktop.openDivineSelection(latest);
      }
    },
    [desktopRole, loadDeityWorship, setActiveTab]
  );

  const clear = useCallback((): void => {
    sessionEpochRef.current += 1;
    deityDataVersionRef.current += 1;
    clearedSessionEpochRef.current = sessionEpochRef.current;
    dispatch({ type: "CLEAR" });
  }, []);

  // ---- Context value ----

  const value = useMemo<DeityContextValue>(
    () => ({
      ...state,
      worship,
      selectDivineTab,
      clear
    }),
    [state, worship, selectDivineTab, clear]
  );

  return <DeityContext.Provider value={value}>{children}</DeityContext.Provider>;
}

// ============================================================
// Hook
// ============================================================

export function useDeity(): DeityContextValue {
  const ctx = useContext(DeityContext);
  if (!ctx) {
    throw new Error("useDeity must be used within DeityProvider");
  }
  return ctx;
}
