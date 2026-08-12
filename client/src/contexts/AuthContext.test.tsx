// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import "../test-setup";
import { renderHook, screen, render, act } from "@testing-library/react";
import {
  createInitialState,
  authReducer,
  AuthProvider,
  useAuth,
  type AuthAction,
  type AuthState
} from "./AuthContext";

// ============================================================
// 辅助函数
// ============================================================

function makeState(overrides?: Partial<AuthState>): AuthState {
  return { ...createInitialState(), ...overrides };
}

// ============================================================
// createInitialState 测试
// ============================================================

describe("createInitialState", () => {
  it("无 localStorage token 时初始 token 为 null", () => {
    localStorage.clear();
    const state = createInitialState();
    expect(state.token).toBeNull();
  });

  it("booting 初始为 true", () => {
    const state = createInitialState();
    expect(state.booting).toBe(true);
  });

  it("currentUser 初始为 null", () => {
    const state = createInitialState();
    expect(state.currentUser).toBeNull();
  });

  it("所有布尔标志初始为 false", () => {
    const state = createInitialState();
    expect(state.authLoading).toBe(false);
    expect(state.authError).toBeNull();
    expect(state.sessionRestoreError).toBeNull();
    expect(state.sessionRetryKey).toBe(0);
    expect(state.accountDeleting).toBe(false);
    expect(state.profileSaving).toBe(false);
    expect(state.profileError).toBeNull();
    expect(state.profileSaved).toBe(false);
  });

  it("有 localStorage token 时读取 token", () => {
    localStorage.setItem("xiaoelong_access_token", "test-token-123");
    const state = createInitialState();
    expect(state.token).toBe("test-token-123");
    localStorage.clear();
  });
});

// ============================================================
// authReducer 单元测试
// ============================================================

describe("authReducer", () => {
  // ---- 正常路径 ----

  it("SET_TOKEN 更新 token", () => {
    const state = makeState({ token: null });
    const action: AuthAction = { type: "SET_TOKEN", payload: "new-token" };
    const next = authReducer(state, action);
    expect(next.token).toBe("new-token");
    // 其他状态不变
    expect(next.currentUser).toBe(state.currentUser);
    expect(next.booting).toBe(state.booting);
  });

  it("AUTH_START 设置 authLoading=true, 清除 authError", () => {
    const state = makeState({ authLoading: false, authError: "上次错误" });
    const action: AuthAction = { type: "AUTH_START" };
    const next = authReducer(state, action);
    expect(next.authLoading).toBe(true);
    expect(next.authError).toBeNull();
  });

  it("AUTH_SUCCESS 设置 token+currentUser, 清除加载态", () => {
    const state = makeState({ authLoading: true, token: null, currentUser: null });
    const user = { id: "u1", nickname: "测试", avatarUrl: null, createdAt: "2026-01-01" };
    const action: AuthAction = { type: "AUTH_SUCCESS", payload: { token: "t1", user } };
    const next = authReducer(state, action);
    expect(next.token).toBe("t1");
    expect(next.currentUser).toEqual(user);
    expect(next.authLoading).toBe(false);
    expect(next.authError).toBeNull();
  });

  it("AUTH_FAILURE 设置 authError, 清除加载态", () => {
    const state = makeState({ authLoading: true, authError: null });
    const action: AuthAction = { type: "AUTH_FAILURE", payload: "邀请码无效" };
    const next = authReducer(state, action);
    expect(next.authError).toBe("邀请码无效");
    expect(next.authLoading).toBe(false);
  });

  it("SESSION_BOOTSTRAP 设置 booting=true, 清除恢复错误", () => {
    const state = makeState({ booting: false, sessionRestoreError: "旧错误" });
    const action: AuthAction = { type: "SESSION_BOOTSTRAP" };
    const next = authReducer(state, action);
    expect(next.booting).toBe(true);
    expect(next.sessionRestoreError).toBeNull();
  });

  it("SESSION_USER_READY 设置 currentUser, booting=false", () => {
    const state = makeState({ booting: true, currentUser: null });
    const user = { id: "u1", nickname: "测试", avatarUrl: null, createdAt: "2026-01-01" };
    const action: AuthAction = { type: "SESSION_USER_READY", payload: user };
    const next = authReducer(state, action);
    expect(next.currentUser).toEqual(user);
    expect(next.booting).toBe(false);
  });

  // ---- 错误路径 ----

  it("SESSION_RESTORE_ERROR 设置错误, booting=false", () => {
    const state = makeState({ booting: true, sessionRestoreError: null });
    const action: AuthAction = {
      type: "SESSION_RESTORE_ERROR",
      payload: "暂时无法连接服务器，登录状态已保留，将自动重试。"
    };
    const next = authReducer(state, action);
    expect(next.sessionRestoreError).toBe("暂时无法连接服务器，登录状态已保留，将自动重试。");
    expect(next.booting).toBe(false);
  });

  it("PROFILE_UPDATE_FAILURE 设置 profileError, 清除保存态", () => {
    const state = makeState({ profileSaving: true, profileError: null });
    const action: AuthAction = { type: "PROFILE_UPDATE_FAILURE", payload: "昵称已被占用" };
    const next = authReducer(state, action);
    expect(next.profileError).toBe("昵称已被占用");
    expect(next.profileSaving).toBe(false);
  });

  // ---- 状态转换 ----

  it("SESSION_RETRY 递增 sessionRetryKey", () => {
    const state = makeState({ sessionRetryKey: 0 });
    const action: AuthAction = { type: "SESSION_RETRY" };
    const next = authReducer(state, action);
    expect(next.sessionRetryKey).toBe(1);
  });

  it("SESSION_RETRY 多次调用持续递增", () => {
    let state = makeState({ sessionRetryKey: 5 });
    state = authReducer(state, { type: "SESSION_RETRY" });
    state = authReducer(state, { type: "SESSION_RETRY" });
    expect(state.sessionRetryKey).toBe(7);
  });

  it("BOOTSTRAP_NO_TOKEN 清 currentUser, 停止 booting", () => {
    const state = makeState({
      booting: true,
      currentUser: { id: "u1", nickname: "残留", avatarUrl: null, createdAt: "2026-01-01" },
      sessionRestoreError: "旧错误"
    });
    const action: AuthAction = { type: "BOOTSTRAP_NO_TOKEN" };
    const next = authReducer(state, action);
    expect(next.currentUser).toBeNull();
    expect(next.booting).toBe(false);
    expect(next.sessionRestoreError).toBeNull();
  });

  it("LOGOUT 重置所有认证状态为初始值", () => {
    const user = { id: "u1", nickname: "测试", avatarUrl: null, createdAt: "2026-01-01" };
    const state = makeState({
      token: "active-token",
      currentUser: user,
      booting: false,
      authLoading: true,
      authError: "错误",
      sessionRestoreError: "恢复错误",
      accountDeleting: true,
      profileSaving: true,
      profileError: "保存错误",
      profileSaved: true
    });
    const action: AuthAction = { type: "LOGOUT" };
    const next = authReducer(state, action);

    expect(next.token).toBeNull();
    expect(next.currentUser).toBeNull();
    expect(next.booting).toBe(false);
    expect(next.authLoading).toBe(false);
    expect(next.authError).toBeNull();
    expect(next.sessionRestoreError).toBeNull();
    expect(next.accountDeleting).toBe(false);
    expect(next.profileSaving).toBe(false);
    expect(next.profileError).toBeNull();
    expect(next.profileSaved).toBe(false);
  });

  it("LOGOUT 不影响 sessionRetryKey", () => {
    const state = makeState({ sessionRetryKey: 3 });
    const action: AuthAction = { type: "LOGOUT" };
    // LOGOUT 不改变 sessionRetryKey（它不需要重置）
    expect(authReducer(state, action).sessionRetryKey).toBe(3);
  });

  it("PROFILE_UPDATE_START 设置保存态, 清错误和已保存标记", () => {
    const state = makeState({
      profileSaving: false,
      profileError: "旧错误",
      profileSaved: true
    });
    const action: AuthAction = { type: "PROFILE_UPDATE_START" };
    const next = authReducer(state, action);
    expect(next.profileSaving).toBe(true);
    expect(next.profileError).toBeNull();
    expect(next.profileSaved).toBe(false);
  });

  it("PROFILE_UPDATE_SUCCESS 更新 currentUser, 保存态完成", () => {
    const oldUser = { id: "u1", nickname: "旧名", avatarUrl: null, createdAt: "2026-01-01" };
    const newUser = { id: "u1", nickname: "新名", avatarUrl: "/avatar.png", createdAt: "2026-01-01" };
    const state = makeState({ currentUser: oldUser, profileSaving: true });
    const action: AuthAction = { type: "PROFILE_UPDATE_SUCCESS", payload: newUser };
    const next = authReducer(state, action);
    expect(next.currentUser).toEqual(newUser);
    expect(next.profileSaving).toBe(false);
    expect(next.profileSaved).toBe(true);
  });

  it("PROFILE_SAVED_DISMISS 清除已保存标记", () => {
    const state = makeState({ profileSaved: true });
    const action: AuthAction = { type: "PROFILE_SAVED_DISMISS" };
    expect(authReducer(state, action).profileSaved).toBe(false);
  });

  it("ACCOUNT_DELETE_START 设置删除中", () => {
    const state = makeState({ accountDeleting: false });
    const action: AuthAction = { type: "ACCOUNT_DELETE_START" };
    expect(authReducer(state, action).accountDeleting).toBe(true);
  });

  it("ACCOUNT_DELETE_FINISH 清除删除中标记", () => {
    const state = makeState({ accountDeleting: true });
    const action: AuthAction = { type: "ACCOUNT_DELETE_FINISH" };
    expect(authReducer(state, action).accountDeleting).toBe(false);
  });

  // ---- 边界条件 ----

  it("未知 action type 返回原 state（不崩溃）", () => {
    const state = makeState();
    const action = { type: "UNKNOWN_ACTION" } as unknown as AuthAction;
    expect(authReducer(state, action)).toBe(state);
  });

  it("reducer 返回新对象，不修改原 state", () => {
    const state = makeState({ token: null });
    const action: AuthAction = { type: "SET_TOKEN", payload: "t1" };
    const next = authReducer(state, action);
    expect(next).not.toBe(state);
    expect(state.token).toBeNull(); // 原 state 未变
  });

  it("AUTH_SUCCESS 带 null 用户信息时正常设置", () => {
    // 生产环境 user 不会是 null，但测试边界情况
    const state = makeState({ currentUser: null });
    const action = {
      type: "AUTH_SUCCESS",
      payload: { token: "t1", user: null }
    } as unknown as AuthAction;
    const next = authReducer(state, action);
    expect(next.token).toBe("t1");
    expect(next.currentUser).toBeNull();
  });
});

// ============================================================
// AuthProvider / useAuth 集成测试
// ============================================================

describe("AuthProvider & useAuth", () => {
  it("useAuth 在 AuthProvider 外抛出错误", () => {
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within AuthProvider"
    );
  });

  it("AuthProvider 正常渲染子组件", () => {
    render(
      <AuthProvider>
        <div data-testid="child">hello</div>
      </AuthProvider>
    );
    expect(screen.getByTestId("child").textContent).toBe("hello");
  });

  it("Provider 内可读取 currentUserId（无用户时为 null）", () => {
    localStorage.clear();
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider
    });
    expect(result.current.currentUserId).toBeNull();
    expect(result.current.token).toBeNull();
    expect(result.current.currentUser).toBeNull();
  });

  it("retrySession 递增 sessionRetryKey", () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider
    });
    const initialKey = result.current.sessionRetryKey;
    act(() => {
      result.current.retrySession();
    });
    expect(result.current.sessionRetryKey).toBe(initialKey + 1);
  });

  it("logout 清空 token 和 currentUser", () => {
    // 需要 token 存在时才能看到清空效果
    localStorage.setItem("xiaoelong_access_token", "test-token");
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider
    });
    // 注意：createInitialState 在 hook 初始化时读取 localStorage
    // token 从 localStorage 中读取，所以初始状态就有 token
    expect(result.current.token).toBe("test-token");

    act(() => {
      result.current.logout();
    });
    expect(result.current.token).toBeNull();
    expect(result.current.currentUser).toBeNull();
    localStorage.clear();
  });

  it("profileSaved 初始为 false", () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider
    });
    expect(result.current.profileSaved).toBe(false);
  });

  it("accountDeleting 初始为 false", () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: AuthProvider
    });
    expect(result.current.accountDeleting).toBe(false);
  });
});
