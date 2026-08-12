import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import type { UserProfile, UserUpdatePayload } from "@xiaoelong/shared";
import {
  ApiError,
  deleteCurrentUser,
  getMe,
  joinWithInvite,
  updateCurrentProfile,
} from "../services/api";
import { disconnectSharedSocket, getOrCreateSocket } from "../services/socket";

// ============================================================
// 常量
// ============================================================

const TOKEN_STORAGE_KEY = "xiaoelong_access_token";

// ============================================================
// 类型定义
// ============================================================

export interface AuthState {
  token: string | null;
  currentUser: UserProfile | null;
  booting: boolean;
  authLoading: boolean;
  authError: string | null;
  sessionRestoreError: string | null;
  sessionRetryKey: number;
  accountDeleting: boolean;
  profileSaving: boolean;
  profileError: string | null;
  profileSaved: boolean;
}

// ============================================================
// Action 类型
// ============================================================

export type AuthAction =
  | { type: "SET_TOKEN"; payload: string }
  | { type: "AUTH_START" }
  | { type: "AUTH_SUCCESS"; payload: { token: string; user: UserProfile } }
  | { type: "AUTH_FAILURE"; payload: string }
  | { type: "SESSION_BOOTSTRAP" }
  | { type: "SESSION_USER_READY"; payload: UserProfile }
  | { type: "SESSION_RESTORE_ERROR"; payload: string }
  | { type: "SESSION_RETRY" }
  | { type: "BOOTSTRAP_NO_TOKEN" }
  | { type: "LOGOUT" }
  | { type: "PROFILE_UPDATE_START"; payload: ProfileUpdateRequest }
  | { type: "PROFILE_UPDATE_SUCCESS"; payload: { request: ProfileUpdateRequest; user: UserProfile } }
  | { type: "PROFILE_UPDATE_FAILURE"; payload: { request: ProfileUpdateRequest; message: string } }
  | { type: "SYNC_CURRENT_USER"; payload: { token: string; user: UserProfile } }
  | { type: "PROFILE_SAVED_DISMISS" }
  | { type: "ACCOUNT_DELETE_START" }
  | { type: "ACCOUNT_DELETE_FINISH" };

// ============================================================
// 模块级辅助函数
// ============================================================

function getInitialAccessToken(): string | null {
  const browserToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (browserToken) {
    return browserToken;
  }

  const persistedToken = window.xiaoelongDesktop?.getPersistedAccessToken?.() ?? null;
  if (persistedToken) {
    localStorage.setItem(TOKEN_STORAGE_KEY, persistedToken);
  }
  return persistedToken;
}

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && error.statusCode === 401;
}

interface ProfileUpdateRequest {
  token: string;
  userId: string;
}

function matchesProfileUpdateRequest(state: AuthState, request: ProfileUpdateRequest): boolean {
  return state.token === request.token && state.currentUser?.id === request.userId;
}

// ============================================================
// 模块级初始值
// ============================================================

export function createInitialState(): AuthState {
  return {
    token: getInitialAccessToken(),
    currentUser: null,
    booting: true,
    authLoading: false,
    authError: null,
    sessionRestoreError: null,
    sessionRetryKey: 0,
    accountDeleting: false,
    profileSaving: false,
    profileError: null,
    profileSaved: false,
  };
}

// ============================================================
// Reducer
// ============================================================

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "SET_TOKEN":
      if (state.token === action.payload) {
        if (state.currentUser || state.booting) {
          return state;
        }
        return {
          ...state,
          booting: true,
          sessionRestoreError: null,
          sessionRetryKey: state.sessionRetryKey + 1
        };
      }
      return {
        ...state,
        token: action.payload,
        currentUser: null,
        booting: true,
        sessionRestoreError: null,
        profileSaving: false,
        profileError: null,
        profileSaved: false
      };

    case "AUTH_START":
      return { ...state, authLoading: true, authError: null };

    case "AUTH_SUCCESS":
      return {
        ...state,
        token: action.payload.token,
        currentUser: action.payload.user,
        booting: true,
        authLoading: false,
        authError: null,
      };

    case "AUTH_FAILURE":
      return { ...state, authLoading: false, authError: action.payload };

    case "SESSION_BOOTSTRAP":
      return { ...state, booting: true, sessionRestoreError: null };

    case "SESSION_USER_READY":
      return { ...state, currentUser: action.payload, booting: false };

    case "SESSION_RESTORE_ERROR":
      return { ...state, sessionRestoreError: action.payload, booting: false };

    case "SESSION_RETRY":
      return { ...state, sessionRetryKey: state.sessionRetryKey + 1 };

    case "BOOTSTRAP_NO_TOKEN":
      return { ...state, currentUser: null, booting: false, sessionRestoreError: null };

    case "LOGOUT":
      return {
        ...state,
        token: null,
        currentUser: null,
        booting: false,
        authLoading: false,
        authError: null,
        sessionRestoreError: null,
        accountDeleting: false,
        profileSaving: false,
        profileError: null,
        profileSaved: false,
      };

    case "PROFILE_UPDATE_START":
      if (!matchesProfileUpdateRequest(state, action.payload)) {
        return state;
      }
      return { ...state, profileSaving: true, profileError: null, profileSaved: false };

    case "PROFILE_UPDATE_SUCCESS":
      if (
        !matchesProfileUpdateRequest(state, action.payload.request) ||
        action.payload.user.id !== action.payload.request.userId
      ) {
        return state;
      }
      return {
        ...state,
        currentUser: action.payload.user,
        profileSaving: false,
        profileSaved: true,
      };

    case "PROFILE_UPDATE_FAILURE":
      if (!matchesProfileUpdateRequest(state, action.payload.request)) {
        return state;
      }
      return { ...state, profileSaving: false, profileError: action.payload.message };

    case "SYNC_CURRENT_USER":
      if (state.token !== action.payload.token || state.currentUser?.id !== action.payload.user.id) {
        return state;
      }
      return { ...state, currentUser: action.payload.user };

    case "PROFILE_SAVED_DISMISS":
      return { ...state, profileSaved: false };

    case "ACCOUNT_DELETE_START":
      return { ...state, accountDeleting: true };

    case "ACCOUNT_DELETE_FINISH":
      return { ...state, accountDeleting: false };

    default:
      return state;
  }
}

// ============================================================
// Context
// ============================================================

export interface AuthContextValue extends AuthState {
  currentUserId: string | null;
  login: (payload: { inviteCode: string; nickname: string; avatarFile: File | null }) => Promise<void>;
  logout: () => void;
  updateProfile: (payload: { nickname: string; avatarFile: File | null }) => Promise<void>;
  deleteAccount: () => Promise<void>;
  retrySession: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ============================================================
// Provider
// ============================================================

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, null, createInitialState);

  // ---- 派生值 ----

  const currentUserId = state.currentUser?.id ?? null;

  // ---- Handler ----

  const logout = useCallback((): void => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.xiaoelongDesktop?.clearPersistedAccessToken?.();
    disconnectSharedSocket();
    dispatch({ type: "LOGOUT" });
  }, []);

  const retrySession = useCallback((): void => {
    dispatch({ type: "SESSION_RETRY" });
  }, []);

  const login = useCallback(
    async (payload: { inviteCode: string; nickname: string; avatarFile: File | null }): Promise<void> => {
      dispatch({ type: "AUTH_START" });

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
        dispatch({
          type: "AUTH_SUCCESS",
          payload: { token: response.accessToken, user: response.user },
        });
      } catch (error) {
        dispatch({
          type: "AUTH_FAILURE",
          payload: error instanceof ApiError ? error.message : "加入失败，请重试。",
        });
      }
    },
    []
  );

  const updateProfile = useCallback(
    async (payload: { nickname: string; avatarFile: File | null }): Promise<void> => {
      const requestToken = state.token;
      const requestUserId = state.currentUser?.id;
      if (!requestToken || !requestUserId) {
        return;
      }

      const request: ProfileUpdateRequest = {
        token: requestToken,
        userId: requestUserId
      };

      const nickname = payload.nickname.trim();
      if (!nickname) {
        dispatch({
          type: "PROFILE_UPDATE_FAILURE",
          payload: { request, message: "昵称不能为空。" }
        });
        return;
      }

      const formData = new FormData();
      formData.append("nickname", nickname);
      if (payload.avatarFile) {
        formData.append("avatar", payload.avatarFile);
      }

      dispatch({ type: "PROFILE_UPDATE_START", payload: request });

      try {
        const response = await updateCurrentProfile(requestToken, formData);
        dispatch({
          type: "PROFILE_UPDATE_SUCCESS",
          payload: { request, user: response.user }
        });
      } catch (error) {
        dispatch({
          type: "PROFILE_UPDATE_FAILURE",
          payload: {
            request,
            message: error instanceof ApiError ? error.message : "保存资料失败，请重试。"
          }
        });
      }
    },
    [state.token, state.currentUser?.id]
  );

  const deleteAccount = useCallback(async (): Promise<void> => {
    if (!state.token) {
      window.xiaoelongDesktop?.requestLogout?.();
      logout();
      return;
    }

    dispatch({ type: "ACCOUNT_DELETE_START" });

    try {
      await deleteCurrentUser(state.token);
      window.xiaoelongDesktop?.requestLogout?.();
      logout();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "注销失败，请重试。");
      dispatch({ type: "ACCOUNT_DELETE_FINISH" });
    }
  }, [state.token, logout]);

  // ---- Bootstrap 会话恢复 ----

  useEffect(() => {
    let canceled = false;
    let retryTimer: number | null = null;

    function expireSession(): void {
      window.xiaoelongDesktop?.requestLogout?.();
      logout();
    }

    function scheduleRetry(): void {
      retryTimer = window.setTimeout(() => {
        if (!canceled) {
          dispatch({ type: "SESSION_RETRY" });
        }
      }, 5000);
    }

    async function bootstrap(): Promise<void> {
      if (!state.token) {
        dispatch({ type: "BOOTSTRAP_NO_TOKEN" });
        return;
      }

      dispatch({ type: "SESSION_BOOTSTRAP" });

      try {
        const meResponse = await getMe(state.token);
        if (canceled) {
          return;
        }

        dispatch({ type: "SESSION_USER_READY", payload: meResponse.user });
        window.xiaoelongDesktop?.persistAccessToken?.(state.token);
      } catch (error) {
        if (canceled) {
          return;
        }

        if (isUnauthorizedError(error)) {
          expireSession();
        } else {
          dispatch({
            type: "SESSION_RESTORE_ERROR",
            payload: "暂时无法连接服务器，登录状态已保留，将自动重试。",
          });
          scheduleRetry();
        }
      }
    }

    void bootstrap();
    return () => {
      canceled = true;
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [state.token, state.sessionRetryKey, logout]);

  // ---- 网络恢复时重试 ----

  useEffect(() => {
    if (!state.token || state.currentUser) {
      return;
    }

    const retryWhenOnline = (): void => {
      dispatch({ type: "SESSION_RETRY" });
    };
    window.addEventListener("online", retryWhenOnline);
    return () => {
      window.removeEventListener("online", retryWhenOnline);
    };
  }, [state.token, state.currentUser]);

  // ---- 当前用户资料实时同步 ----

  useEffect(() => {
    if (!state.token || !currentUserId || window.xiaoelongDesktop?.role === "auth") {
      return;
    }

    const token = state.token;
    const socket = getOrCreateSocket(token);
    const handleUserUpdate = (payload: UserUpdatePayload): void => {
      if (payload.user.id !== currentUserId) {
        return;
      }
      dispatch({ type: "SYNC_CURRENT_USER", payload: { token, user: payload.user } });
    };

    socket.on("user:update", handleUserUpdate);
    return () => {
      socket.off("user:update", handleUserUpdate);
    };
  }, [state.token, currentUserId]);

  // ---- profileSaved 自动消失（2.2 秒） ----

  useEffect(() => {
    if (!state.profileSaved) {
      return;
    }

    const timer = window.setTimeout(() => {
      dispatch({ type: "PROFILE_SAVED_DISMISS" });
    }, 2200);

    return () => {
      window.clearTimeout(timer);
    };
  }, [state.profileSaved]);

  // ---- IPC 事件监听（onLogin / onLogout） ----

  useEffect(() => {
    if (!window.xiaoelongDesktop?.isDesktop) {
      return;
    }

    const loginCleanup = window.xiaoelongDesktop.onLogin?.((nextToken) => {
      if (!nextToken) {
        return;
      }
      localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
      dispatch({ type: "SET_TOKEN", payload: nextToken });
    });

    const logoutCleanup = window.xiaoelongDesktop.onLogout?.(() => {
      logout();
    });

    return () => {
      loginCleanup?.();
      logoutCleanup?.();
    };
  }, [logout]);

  // ---- Context value ----

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      currentUserId,
      login,
      logout,
      updateProfile,
      deleteAccount,
      retrySession,
    }),
    [state, currentUserId, login, logout, updateProfile, deleteAccount, retrySession]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================
// Hook
// ============================================================

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
