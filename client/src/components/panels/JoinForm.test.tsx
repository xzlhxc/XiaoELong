// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../test-setup";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useAuth, type AuthContextValue } from "../../contexts/AuthContext";
import { JoinForm } from "./JoinForm";

// ============================================================
// Mock 依赖：AuthContext（方案 A 后 JoinForm 内部 useAuth）
// ============================================================

vi.mock("../../contexts/AuthContext", () => ({ useAuth: vi.fn() }));

const mockedUseAuth = vi.mocked(useAuth);

let login: ReturnType<typeof vi.fn>;

/** 只 mock JoinForm 用到的 3 个字段，其余用类型断言占位 */
function mockAuth(overrides: Partial<AuthContextValue> = {}): void {
  mockedUseAuth.mockReturnValue({
    authLoading: false,
    authError: null,
    login,
    ...overrides
  } as unknown as AuthContextValue);
}

beforeEach(() => {
  login = vi.fn().mockResolvedValue(undefined);
  mockAuth();
});

afterEach(() => {
  mockedUseAuth.mockReset();
});

function fillInviteAndNickname(invite = "abc123", nickname = "小明"): void {
  fireEvent.change(screen.getByPlaceholderText("请输入邀请码"), { target: { value: invite } });
  fireEvent.change(screen.getByPlaceholderText("请输入昵称"), { target: { value: nickname } });
}

async function submitForm(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "加入小鳄龙" }));
  await waitFor(() => expect(login).toHaveBeenCalledTimes(1));
}

// ============================================================
// 正常路径
// ============================================================

describe("JoinForm 正常路径", () => {
  it("填邀请码+昵称提交，login 收到完整 payload（未选头像时 avatarFile 为 null）", async () => {
    render(<JoinForm />);
    fillInviteAndNickname("abc123", "小明");

    await submitForm();

    expect(login).toHaveBeenCalledWith({ inviteCode: "abc123", nickname: "小明", avatarFile: null });
  });

  it("选择头像文件后提交，avatarFile 为所选文件且头像区显示文件名", async () => {
    render(<JoinForm />);
    fillInviteAndNickname("abc123", "小明");

    const file = new File(["data"], "avatar.png", { type: "image/png" });
    fireEvent.change(document.querySelector("input[type=file]") as HTMLInputElement, {
      target: { files: [file] }
    });
    expect(screen.getByText("avatar.png")).toBeTruthy();

    await submitForm();

    expect(login).toHaveBeenCalledWith({ inviteCode: "abc123", nickname: "小明", avatarFile: file });
  });
});

// ============================================================
// 边界条件
// ============================================================

describe("JoinForm 边界条件", () => {
  it("未选头像时显示'未选择图片'", () => {
    render(<JoinForm />);
    expect(screen.getByText("未选择图片")).toBeTruthy();
  });

  it("邀请码与昵称 input 带 required 属性（浏览器原生校验的结构前提）", () => {
    render(<JoinForm />);
    const invite = screen.getByPlaceholderText("请输入邀请码") as HTMLInputElement;
    const nickname = screen.getByPlaceholderText("请输入昵称") as HTMLInputElement;
    expect(invite.required).toBe(true);
    expect(nickname.required).toBe(true);
  });

  it("昵称 input 带 maxLength=32", () => {
    render(<JoinForm />);
    const nickname = screen.getByPlaceholderText("请输入昵称") as HTMLInputElement;
    expect(nickname.maxLength).toBe(32);
  });
});

// ============================================================
// 错误路径
// ============================================================

describe("JoinForm 错误路径", () => {
  it("authError 有值时渲染 .error-text 文案", () => {
    mockAuth({ authError: "邀请码无效" });
    render(<JoinForm />);
    expect(document.querySelector(".error-text")).toBeTruthy();
    expect(screen.getByText("邀请码无效")).toBeTruthy();
  });

  it("authError 为 null 时不渲染错误文案", () => {
    render(<JoinForm />);
    expect(document.querySelector(".error-text")).toBeNull();
  });
});

// ============================================================
// 状态转换
// ============================================================

describe("JoinForm 状态转换", () => {
  it("authLoading 时按钮禁用且文案为'加入中...'，否则可点且为'加入小鳄龙'", () => {
    const { rerender } = render(<JoinForm />);
    expect(screen.getByRole("button", { name: "加入小鳄龙" })).toBeEnabled();

    mockAuth({ authLoading: true });
    rerender(<JoinForm />);

    const busy = screen.getByRole("button", { name: "加入中..." }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
  });

  it("受控输入：输入邀请码与昵称后 input value 同步", () => {
    render(<JoinForm />);
    fillInviteAndNickname("xyz", "小红");

    expect((screen.getByPlaceholderText("请输入邀请码") as HTMLInputElement).value).toBe("xyz");
    expect((screen.getByPlaceholderText("请输入昵称") as HTMLInputElement).value).toBe("小红");
  });
});
