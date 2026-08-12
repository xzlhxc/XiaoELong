// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../test-setup";
import { fireEvent, render, screen } from "@testing-library/react";
import { useAuth, type AuthContextValue } from "../../contexts/AuthContext";
import { useDesktop, type DesktopContextValue } from "../../contexts/DesktopContext";
import { AuthPage } from "./AuthPage";

// ============================================================
// Mock 依赖：DesktopContext / AuthContext / JoinForm（子组件）
// ============================================================

vi.mock("../../contexts/DesktopContext", () => ({ useDesktop: vi.fn() }));
vi.mock("../../contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../panels/JoinForm", () => ({ JoinForm: () => <span data-testid="join-form" /> }));

const mockedUseDesktop = vi.mocked(useDesktop);
const mockedUseAuth = vi.mocked(useAuth);

let retrySession: ReturnType<typeof vi.fn>;

/** 只 mock AuthPage 用到的 3 个字段，其余用类型断言占位 */
function mockAuth(overrides: Partial<AuthContextValue> = {}): void {
  mockedUseAuth.mockReturnValue({
    token: null,
    sessionRestoreError: null,
    retrySession,
    ...overrides
  } as unknown as AuthContextValue);
}

beforeEach(() => {
  retrySession = vi.fn();
  mockAuth();
  mockedUseDesktop.mockReturnValue({ desktopRole: "single" } as unknown as DesktopContextValue);
});

afterEach(() => {
  mockedUseAuth.mockReset();
  mockedUseDesktop.mockReset();
});

// ============================================================
// 正常路径
// ============================================================

describe("AuthPage 正常路径", () => {
  it("shell 角色（avatar/panel/divine）渲染空页", () => {
    for (const role of ["avatar", "panel", "divine"]) {
      mockedUseDesktop.mockReturnValue({ desktopRole: role } as unknown as DesktopContextValue);
      const { container } = render(<AuthPage />);
      expect(container.querySelector(".empty-page")).toBeTruthy();
    }
  });

  it("有 token 时渲染会话恢复卡片", () => {
    mockAuth({ token: "saved-token" });
    render(<AuthPage />);
    expect(document.querySelector(".session-recovery-card")).toBeTruthy();
    expect(screen.getByText("正在恢复登录")).toBeTruthy();
  });

  it("无 token 时渲染 JoinForm", () => {
    render(<AuthPage />);
    expect(screen.getByTestId("join-form")).toBeTruthy();
  });
});

// ============================================================
// 状态转换
// ============================================================

describe("AuthPage 状态转换", () => {
  it("点'立即重试'调用 retrySession", () => {
    mockAuth({ token: "saved-token", sessionRestoreError: "网络异常" });
    render(<AuthPage />);
    fireEvent.click(screen.getByRole("button", { name: "立即重试" }));
    expect(retrySession).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// 边界条件
// ============================================================

describe("AuthPage 边界条件", () => {
  it("sessionRestoreError 有值时显示错误文案", () => {
    mockAuth({ token: "saved-token", sessionRestoreError: "网络异常" });
    render(<AuthPage />);
    expect(screen.getByText("网络异常")).toBeTruthy();
  });

  it("sessionRestoreError 为 null 时显示默认文案", () => {
    mockAuth({ token: "saved-token", sessionRestoreError: null });
    render(<AuthPage />);
    expect(screen.getByText("正在验证已保存的登录状态，请稍候。")).toBeTruthy();
  });
});
