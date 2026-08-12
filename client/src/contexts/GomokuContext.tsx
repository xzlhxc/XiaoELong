import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import {
  type GomokuEndPayload,
  type GomokuGame,
  type GomokuUpdatePayload,
  type UserProfile,
  type UserUpdatePayload
} from "@xiaoelong/shared";
import { getGomokuGames } from "../services/api";
import { getPetReaction } from "../utils/pet-animation";
import { getOrCreateSocket, getSharedSocket, type AppSocket } from "../services/socket";
import { useAuth } from "./AuthContext";
import { useDesktop } from "./DesktopContext";

// ============================================================
// 类型定义
// ============================================================

export interface GomokuState {
  games: GomokuGame[];
  selectedGameId: number | null;
  error: string | null;
  loading: boolean;
}

// ============================================================
// Action 类型
// ============================================================

export type GomokuAction =
  | { type: "SET_GAMES"; payload: GomokuGame[] }
  | { type: "UPSERT_GAME"; payload: GomokuGame }
  | { type: "APPLY_USER_UPDATE"; payload: UserProfile }
  | { type: "SET_SELECTED_GAME"; payload: number | null }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "CLEAR" };

// ============================================================
// 模块级初始值
// ============================================================

export function createInitialState(): GomokuState {
  return {
    games: [],
    selectedGameId: null,
    error: null,
    loading: false
  };
}

// ============================================================
// 模块级辅助函数（从 App.tsx 原样搬入，不做修改）
// ============================================================

function applyUserUpdateToGames(current: GomokuGame[], user: UserProfile): GomokuGame[] {
  let changed = false;
  const next = current.map((game) => {
    const updatesBlack = game.playerBlack.id === user.id;
    const updatesWhite = game.playerWhite.id === user.id;
    if (!updatesBlack && !updatesWhite) {
      return game;
    }

    changed = true;
    return {
      ...game,
      playerBlack: updatesBlack ? { ...game.playerBlack, ...user } : game.playerBlack,
      playerWhite: updatesWhite ? { ...game.playerWhite, ...user } : game.playerWhite
    };
  });
  return changed ? next : current;
}

function areUserProfilesEqual(left: UserProfile, right: UserProfile): boolean {
  return (
    left.id === right.id &&
    left.nickname === right.nickname &&
    left.avatarUrl === right.avatarUrl &&
    left.createdAt === right.createdAt
  );
}

function areBoardsEqual(left: number[][], right: number[][]): boolean {
  return (
    left.length === right.length &&
    left.every((row, rowIndex) => {
      const rightRow = right[rowIndex];
      return Boolean(rightRow) && row.length === rightRow.length && row.every((cell, colIndex) => cell === rightRow[colIndex]);
    })
  );
}

function areGamesEqual(left: GomokuGame, right: GomokuGame): boolean {
  return (
    left.id === right.id &&
    left.status === right.status &&
    left.currentTurn === right.currentTurn &&
    left.winner === right.winner &&
    left.invitedBy === right.invitedBy &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    areUserProfilesEqual(left.playerBlack, right.playerBlack) &&
    areUserProfilesEqual(left.playerWhite, right.playerWhite) &&
    areBoardsEqual(left.boardState, right.boardState)
  );
}

function compareGames(left: GomokuGame, right: GomokuGame): number {
  return right.updatedAt.localeCompare(left.updatedAt) || right.id - left.id;
}

export function upsertGame(list: GomokuGame[], game: GomokuGame): GomokuGame[] {
  const existingIndex = list.findIndex((item) => item.id === game.id);
  if (existingIndex === -1) {
    return [game, ...list].sort(compareGames);
  }

  if (areGamesEqual(list[existingIndex], game)) {
    return list;
  }

  const next = [...list];
  next[existingIndex] = game;
  return next.sort(compareGames);
}

async function emitWithAck<T>(
  socket: AppSocket,
  event: "gomoku:invite" | "gomoku:accept" | "gomoku:reject" | "gomoku:move",
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

// ============================================================
// Reducer
// ============================================================

export function gomokuReducer(state: GomokuState, action: GomokuAction): GomokuState {
  switch (action.type) {
    // 全量替换（REST 加载）。选中对局跟随列表：仍在则保留，否则退到第一个或 null
    case "SET_GAMES": {
      const games = action.payload;
      const keepSelected =
        state.selectedGameId !== null && games.some((game) => game.id === state.selectedGameId);
      return {
        ...state,
        games,
        selectedGameId: keepSelected ? state.selectedGameId : (games[0]?.id ?? null)
      };
    }

    // 插入或更新对局；若当前未选中，自动选中刚更新的对局
    case "UPSERT_GAME":
      return {
        ...state,
        games: upsertGame(state.games, action.payload),
        selectedGameId: state.selectedGameId ?? action.payload.id
      };

    // user:update 广播，同步对局内玩家资料
    case "APPLY_USER_UPDATE":
      return { ...state, games: applyUserUpdateToGames(state.games, action.payload) };

    case "SET_SELECTED_GAME":
      return { ...state, selectedGameId: action.payload };

    case "SET_ERROR":
      return { ...state, error: action.payload };

    case "SET_LOADING":
      return { ...state, loading: action.payload };

    case "CLEAR":
      return createInitialState();

    default:
      return state;
  }
}

// ============================================================
// Context
// ============================================================

export interface GomokuContextValue extends GomokuState {
  selectGame: (gameId: number) => void;
  invite: (targetUserId: string) => Promise<void>;
  accept: (gameId: number) => Promise<void>;
  reject: (gameId: number) => Promise<void>;
  move: (gameId: number, row: number, col: number) => Promise<boolean>;
  refresh: () => Promise<void>;
  clear: () => void;
}

const GomokuContext = createContext<GomokuContextValue | null>(null);

// ============================================================
// Provider
// ============================================================

export function GomokuProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(gomokuReducer, null, createInitialState);

  const { token, currentUserId } = useAuth();
  const { desktopRole, setPetReaction } = useDesktop();

  // 防重复落子：同一对局提交期间加锁
  const pendingGomokuMoveIdsRef = useRef<Set<number>>(new Set());

  // ---- 加载对局列表 ----

  const refresh = useCallback(async (): Promise<void> => {
    if (!token) {
      return;
    }

    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });
    try {
      const result = await getGomokuGames(token);
      dispatch({ type: "SET_GAMES", payload: result.games });
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: error instanceof Error ? error.message : "加载五子棋对局失败。" });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  }, [token]);

  // ---- ① 数据加载 + Socket 监听（按角色分流） ----

  useEffect(() => {
    if (!token || !currentUserId || desktopRole === "auth") {
      return;
    }

    if (desktopRole !== "avatar") {
      void refresh();
    }

    const socket = getOrCreateSocket(token);

    const handleUserUpdate = (payload: UserUpdatePayload): void => {
      dispatch({ type: "APPLY_USER_UPDATE", payload: payload.user });
    };

    const handleGomokuUpdate = (payload: GomokuUpdatePayload): void => {
      dispatch({ type: "UPSERT_GAME", payload: payload.game });
    };

    const handleGomokuEnd = (payload: GomokuEndPayload): void => {
      if (desktopRole !== "avatar") {
        dispatch({ type: "UPSERT_GAME", payload: payload.game });
      }
      if (desktopRole === "avatar" || desktopRole === "single") {
        setPetReaction(getPetReaction(payload.game.id, payload.winner, currentUserId));
      }
    };

    socket.on("user:update", handleUserUpdate);

    if (desktopRole !== "avatar") {
      socket.on("gomoku:update", handleGomokuUpdate);
    }

    socket.on("gomoku:end", handleGomokuEnd);

    return () => {
      socket.off("user:update", handleUserUpdate);
      if (desktopRole !== "avatar") {
        socket.off("gomoku:update", handleGomokuUpdate);
      }
      socket.off("gomoku:end", handleGomokuEnd);
    };
  }, [token, currentUserId, desktopRole, refresh, setPetReaction]);

  // ---- ② 登出清理 ----

  useEffect(() => {
    if (!token || !currentUserId) {
      dispatch({ type: "CLEAR" });
    }
  }, [token, currentUserId]);

  // ---- Handler ----

  const selectGame = useCallback((gameId: number): void => {
    dispatch({ type: "SET_SELECTED_GAME", payload: gameId });
  }, []);

  const invite = useCallback(async (targetUserId: string): Promise<void> => {
    const socket = getSharedSocket();
    if (!socket) {
      dispatch({ type: "SET_ERROR", payload: "连接未建立，无法发起邀请。" });
      return;
    }

    dispatch({ type: "SET_ERROR", payload: null });
    try {
      const result = await emitWithAck<{ game: GomokuGame }>(socket, "gomoku:invite", { targetUserId });
      dispatch({ type: "UPSERT_GAME", payload: result.game });
      dispatch({ type: "SET_SELECTED_GAME", payload: result.game.id });
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: error instanceof Error ? error.message : "发起邀请失败。" });
    }
  }, []);

  const accept = useCallback(async (gameId: number): Promise<void> => {
    const socket = getSharedSocket();
    if (!socket) {
      dispatch({ type: "SET_ERROR", payload: "连接未建立，无法接受邀请。" });
      return;
    }

    dispatch({ type: "SET_ERROR", payload: null });
    try {
      const result = await emitWithAck<{ game: GomokuGame }>(socket, "gomoku:accept", { gameId });
      dispatch({ type: "UPSERT_GAME", payload: result.game });
      dispatch({ type: "SET_SELECTED_GAME", payload: result.game.id });
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: error instanceof Error ? error.message : "接受邀请失败。" });
    }
  }, []);

  const reject = useCallback(async (gameId: number): Promise<void> => {
    const socket = getSharedSocket();
    if (!socket) {
      dispatch({ type: "SET_ERROR", payload: "连接未建立，无法拒绝邀请。" });
      return;
    }

    dispatch({ type: "SET_ERROR", payload: null });
    try {
      const result = await emitWithAck<{ game: GomokuGame }>(socket, "gomoku:reject", { gameId });
      dispatch({ type: "UPSERT_GAME", payload: result.game });
      dispatch({ type: "SET_SELECTED_GAME", payload: result.game.id });
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: error instanceof Error ? error.message : "拒绝邀请失败。" });
    }
  }, []);

  const move = useCallback(async (gameId: number, row: number, col: number): Promise<boolean> => {
    const socket = getSharedSocket();
    if (!socket) {
      dispatch({ type: "SET_ERROR", payload: "连接未建立，无法落子。" });
      return false;
    }
    if (pendingGomokuMoveIdsRef.current.has(gameId)) {
      return false;
    }

    pendingGomokuMoveIdsRef.current.add(gameId);
    dispatch({ type: "SET_ERROR", payload: null });
    try {
      const result = await emitWithAck<{ game: GomokuGame }>(socket, "gomoku:move", { gameId, row, col });
      dispatch({ type: "UPSERT_GAME", payload: result.game });
      return true;
    } catch (error) {
      dispatch({ type: "SET_ERROR", payload: error instanceof Error ? error.message : "落子失败。" });
      return false;
    } finally {
      pendingGomokuMoveIdsRef.current.delete(gameId);
    }
  }, []);

  const clear = useCallback((): void => {
    dispatch({ type: "CLEAR" });
  }, []);

  // ---- Context value ----

  const value = useMemo<GomokuContextValue>(
    () => ({
      ...state,
      selectGame,
      invite,
      accept,
      reject,
      move,
      refresh,
      clear
    }),
    [state, selectGame, invite, accept, reject, move, refresh, clear]
  );

  return <GomokuContext.Provider value={value}>{children}</GomokuContext.Provider>;
}

// ============================================================
// Hook
// ============================================================

export function useGomoku(): GomokuContextValue {
  const ctx = useContext(GomokuContext);
  if (!ctx) {
    throw new Error("useGomoku must be used within GomokuProvider");
  }
  return ctx;
}
