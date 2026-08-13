import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import {
  ACCESS_TOKEN_SESSION_VERSION,
  type AuthMeResponse,
  type UserProfile,
  type UserUpdatePayload
} from "@xiaoelong/shared";
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
const SESSION_RENEWAL_LEAD_MS = 6 * 24 * 60 * 60 * 1000;
const SESSION_RENEWAL_RETRY_MS = 12 * 60 * 60 * 1000;
const SESSION_RENEWAL_TIMER_SLICE_MS = 24 * 60 * 60 * 1000;
const SESSION_RENEWAL_DEBOUNCE_MS = 60 * 1000;

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
  | {
      type: "SESSION_USER_READY";
      payload: { requestToken: string; token: string; user: UserProfile };
    }
  | {
      type: "SESSION_TOKEN_REFRESHED";
      payload: { expectedToken: string; renewedToken: string };
    }
  | { type: "SESSION_RESTORE_ERROR"; payload: { requestToken: string; message: string } }
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

function getRenewedAccessToken(response: AuthMeResponse, fallbackToken: string): string {
  const accessToken = response.accessToken;
  return typeof accessToken === "string" && accessToken.length > 0 && accessToken.length <= 8192
    ? accessToken
    : fallbackToken;
}

function persistAccessTokenInRenderer(accessToken: string): void {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
  } catch (error) {
    console.error("[Auth] Failed to persist renewed token in renderer storage.", error);
  }
}

interface AccessTokenMetadata {
  issuedAt: number;
  expiresAt: number;
  sessionVersion: number;
}

function getAccessTokenMetadata(accessToken: string): AccessTokenMetadata | null {
  try {
    const payloadPart = accessToken.split(".")[1];
    if (!payloadPart) {
      return null;
    }

    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(window.atob(padded)) as {
      exp?: unknown;
      iat?: unknown;
      sessionVersion?: unknown;
    };
    if (
      typeof payload.iat !== "number" ||
      !Number.isSafeInteger(payload.iat) ||
      payload.iat <= 0 ||
      typeof payload.exp !== "number" ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp <= payload.iat ||
      payload.iat > Number.MAX_SAFE_INTEGER / 1000 ||
      payload.exp > Number.MAX_SAFE_INTEGER / 1000
    ) {
      return null;
    }

    return {
      issuedAt: payload.iat * 1000,
      expiresAt: payload.exp * 1000,
      sessionVersion:
        typeof payload.sessionVersion === "number" &&
        Number.isSafeInteger(payload.sessionVersion)
          ? payload.sessionVersion
          : 0
    };
  } catch {
    return null;
  }
}

function shouldScheduleSessionRenewal(): boolean {
  const desktop = window.xiaoelongDesktop;
  return !desktop?.isDesktop || desktop.role === "avatar";
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
      return { ...state, booting: state.currentUser === null, sessionRestoreError: null };

    case "SESSION_USER_READY":
      if (state.token !== action.payload.requestToken) {
        return state;
      }
      return {
        ...state,
        token: action.payload.token,
        currentUser: action.payload.user,
        booting: false
      };

    case "SESSION_TOKEN_REFRESHED":
      if (state.token !== action.payload.expectedToken) {
        return state;
      }
      return {
        ...state,
        token: action.payload.renewedToken,
        sessionRestoreError: null
      };

    case "SESSION_RESTORE_ERROR":
      if (state.token !== action.payload.requestToken) {
        return state;
      }
      return { ...state, sessionRestoreError: action.payload.message, booting: false };

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
  invalidateSession: (expectedToken: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ============================================================
// Provider
// ============================================================

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, null, createInitialState);
  const activeSessionTokenRef = useRef(state.token);
  const validatedSessionRef = useRef<{ token: string; retryKey: number } | null>(null);
  const lastScheduledRenewalRef = useRef(0);
  const currentUserIdRef = useRef(state.currentUser?.id ?? null);
  const sessionRetryKeyRef = useRef(state.sessionRetryKey);
  activeSessionTokenRef.current = state.token;
  currentUserIdRef.current = state.currentUser?.id ?? null;
  sessionRetryKeyRef.current = state.sessionRetryKey;

  // ---- 派生值 ----

  const currentUserId = state.currentUser?.id ?? null;

  // ---- Handler ----

  const clearLocalSession = useCallback((): void => {
    activeSessionTokenRef.current = null;
    validatedSessionRef.current = null;
    lastScheduledRenewalRef.current = 0;
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    disconnectSharedSocket();
    dispatch({ type: "LOGOUT" });
  }, []);

  const logout = useCallback((): void => {
    clearLocalSession();
    if (window.xiaoelongDesktop?.requestLogout) {
      window.xiaoelongDesktop.requestLogout();
    } else {
      window.xiaoelongDesktop?.clearPersistedAccessToken?.();
    }
  }, [clearLocalSession]);

  const retrySession = useCallback((): void => {
    dispatch({ type: "SESSION_RETRY" });
  }, []);

  const adoptCanonicalSession = useCallback((canonicalToken: string | null): void => {
    if (!canonicalToken) {
      activeSessionTokenRef.current = null;
      validatedSessionRef.current = null;
      lastScheduledRenewalRef.current = 0;
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      disconnectSharedSocket();
      dispatch({ type: "LOGOUT" });
      return;
    }

    if (activeSessionTokenRef.current === canonicalToken) {
      return;
    }
    activeSessionTokenRef.current = canonicalToken;
    validatedSessionRef.current = null;
    lastScheduledRenewalRef.current = 0;
    persistAccessTokenInRenderer(canonicalToken);
    dispatch({ type: "SET_TOKEN", payload: canonicalToken });
  }, []);

  const invalidateSession = useCallback(
    async (expectedToken: string): Promise<void> => {
      if (activeSessionTokenRef.current !== expectedToken) {
        return;
      }

      const invalidateAccessToken = window.xiaoelongDesktop?.invalidateAccessToken;
      if (invalidateAccessToken) {
        const canonicalToken = await invalidateAccessToken(expectedToken);
        if (activeSessionTokenRef.current !== expectedToken) {
          return;
        }
        adoptCanonicalSession(canonicalToken);
        return;
      }

      // 浏览器模式没有共享主进程；这里只清理当前 renderer 的匹配会话。
      adoptCanonicalSession(null);
    },
    [adoptCanonicalSession]
  );

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
        activeSessionTokenRef.current = response.accessToken;
        validatedSessionRef.current = null;
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
      logout();
      return;
    }

    dispatch({ type: "ACCOUNT_DELETE_START" });

    try {
      await deleteCurrentUser(state.token);
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
    const requestToken = state.token;
    const requestRetryKey = state.sessionRetryKey;

    function scheduleRetry(): void {
      retryTimer = window.setTimeout(() => {
        if (!canceled && activeSessionTokenRef.current === requestToken) {
          dispatch({ type: "SESSION_RETRY" });
        }
      }, 5000);
    }

    async function bootstrap(): Promise<void> {
      if (!requestToken) {
        dispatch({ type: "BOOTSTRAP_NO_TOKEN" });
        return;
      }

      if (
        validatedSessionRef.current?.token === requestToken &&
        validatedSessionRef.current.retryKey === requestRetryKey
      ) {
        return;
      }

      dispatch({ type: "SESSION_BOOTSTRAP" });

      try {
        lastScheduledRenewalRef.current = Date.now();
        const meResponse = await getMe(requestToken);
        if (canceled || activeSessionTokenRef.current !== requestToken) {
          return;
        }

        const renewedToken = getRenewedAccessToken(meResponse, requestToken);
        if (window.xiaoelongDesktop?.refreshAccessToken) {
          const canonicalToken = await window.xiaoelongDesktop.refreshAccessToken(
            requestToken,
            renewedToken
          );
          if (canceled || activeSessionTokenRef.current !== requestToken) {
            return;
          }

          if (canonicalToken !== renewedToken) {
            adoptCanonicalSession(canonicalToken);
            return;
          }
        }

        activeSessionTokenRef.current = renewedToken;
        validatedSessionRef.current = { token: renewedToken, retryKey: requestRetryKey };
        persistAccessTokenInRenderer(renewedToken);
        dispatch({
          type: "SESSION_USER_READY",
          payload: { requestToken, token: renewedToken, user: meResponse.user }
        });
      } catch (error) {
        if (canceled || activeSessionTokenRef.current !== requestToken) {
          return;
        }

        if (isUnauthorizedError(error)) {
          await invalidateSession(requestToken);
        } else {
          dispatch({
            type: "SESSION_RESTORE_ERROR",
            payload: {
              requestToken,
              message: "暂时无法连接服务器，登录状态已保留，将自动重试。"
            }
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
  }, [state.token, state.sessionRetryKey, invalidateSession, adoptCanonicalSession]);

  // ---- 常驻运行时在过期前自动续签（桌面端仅由头像窗口发起） ----

  useEffect(() => {
    const accessToken = state.token;
    if (!accessToken || !currentUserId || !shouldScheduleSessionRenewal()) {
      return;
    }

    const metadata = getAccessTokenMetadata(accessToken);
    if (
      metadata === null ||
      metadata.sessionVersion > ACCESS_TOKEN_SESSION_VERSION
    ) {
      return;
    }

    let canceled = false;
    let timer: number | null = null;
    const tokenLifetime = metadata.expiresAt - metadata.issuedAt;
    const renewalLead = Math.min(
      SESSION_RENEWAL_LEAD_MS,
      Math.max(1000, Math.floor(tokenLifetime / 3))
    );

    const isRenewalDue = (): boolean =>
      metadata.sessionVersion < ACCESS_TOKEN_SESSION_VERSION ||
      Date.now() >= metadata.expiresAt - renewalLead;

    const requestRenewal = (): void => {
      const now = Date.now();
      if (
        canceled ||
        activeSessionTokenRef.current !== accessToken ||
        now - lastScheduledRenewalRef.current < SESSION_RENEWAL_DEBOUNCE_MS
      ) {
        return;
      }

      lastScheduledRenewalRef.current = now;
      dispatch({ type: "SESSION_RETRY" });
    };

    const schedule = (): void => {
      if (canceled || activeSessionTokenRef.current !== accessToken) {
        return;
      }

      const untilRenewal =
        metadata.sessionVersion >= ACCESS_TOKEN_SESSION_VERSION
          ? metadata.expiresAt - renewalLead - Date.now()
          : 0;
      if (untilRenewal <= 0) {
        requestRenewal();
        const remainingLifetime = metadata.expiresAt - Date.now();
        timer = window.setTimeout(
          schedule,
          Math.min(
            SESSION_RENEWAL_RETRY_MS,
            Math.max(SESSION_RENEWAL_DEBOUNCE_MS, Math.floor(remainingLifetime / 2))
          )
        );
        return;
      }

      timer = window.setTimeout(
        schedule,
        Math.min(untilRenewal, SESSION_RENEWAL_TIMER_SLICE_MS)
      );
    };

    const retryWhenAvailable = (): void => {
      if (isRenewalDue()) {
        requestRenewal();
      }
    };
    const retryWhenVisible = (): void => {
      if (document.visibilityState === "visible") {
        retryWhenAvailable();
      }
    };

    schedule();
    window.addEventListener("online", retryWhenAvailable);
    document.addEventListener("visibilitychange", retryWhenVisible);

    return () => {
      canceled = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      window.removeEventListener("online", retryWhenAvailable);
      document.removeEventListener("visibilitychange", retryWhenVisible);
    };
  }, [state.token, currentUserId]);

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
      persistAccessTokenInRenderer(nextToken);
      if (activeSessionTokenRef.current === nextToken) {
        dispatch({ type: "SET_TOKEN", payload: nextToken });
        return;
      }
      activeSessionTokenRef.current = nextToken;
      validatedSessionRef.current = null;
      lastScheduledRenewalRef.current = 0;
      dispatch({ type: "SET_TOKEN", payload: nextToken });
    });

    const refreshCleanup = window.xiaoelongDesktop.onAccessTokenRefresh?.(
      ({ expectedToken, renewedToken }) => {
        if (
          !expectedToken ||
          !renewedToken ||
          activeSessionTokenRef.current !== expectedToken
        ) {
          return;
        }

        activeSessionTokenRef.current = renewedToken;
        validatedSessionRef.current = currentUserIdRef.current
          ? { token: renewedToken, retryKey: sessionRetryKeyRef.current }
          : null;
        lastScheduledRenewalRef.current = 0;
        persistAccessTokenInRenderer(renewedToken);
        dispatch({
          type: "SESSION_TOKEN_REFRESHED",
          payload: { expectedToken, renewedToken }
        });
      }
    );

    const logoutCleanup = window.xiaoelongDesktop.onLogout?.(() => {
      clearLocalSession();
    });

    return () => {
      loginCleanup?.();
      refreshCleanup?.();
      logoutCleanup?.();
    };
  }, [clearLocalSession]);

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
      invalidateSession,
    }),
    [
      state,
      currentUserId,
      login,
      logout,
      updateProfile,
      deleteAccount,
      retrySession,
      invalidateSession
    ]
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
