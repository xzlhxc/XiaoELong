// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../test-setup";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { UserProfile } from "@xiaoelong/shared";
import { useAuth, type AuthContextValue } from "../../contexts/AuthContext";
import { SettingsProfileForm } from "./SettingsProfileForm";

// ============================================================
// Mock 依赖：AuthContext / UserAvatar
// ============================================================

vi.mock("../../contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../atoms/UserAvatar", () => ({
  UserAvatar: () => <span data-testid="user-avatar" />
}));

const mockedUseAuth = vi.mocked(useAuth);

function makeUser(id = "u1", nickname = "小明"): UserProfile {
  return { id, nickname, avatarUrl: null, createdAt: "2026-01-01" };
}

let updateProfile: ReturnType<typeof vi.fn>;

/** 只 mock SettingsProfileForm 用到的 5 个字段，其余用类型断言占位 */
function mockAuth(overrides: Partial<AuthContextValue> = {}): void {
  mockedUseAuth.mockReturnValue({
    currentUser: makeUser(),
    profileSaving: false,
    profileError: null,
    profileSaved: false,
    updateProfile,
    ...overrides
  } as unknown as AuthContextValue);
}

beforeEach(() => {
  updateProfile = vi.fn().mockResolvedValue(undefined);
  mockAuth();
  // jsdom 未实现 URL.createObjectURL（头像预览用）
  Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:mock-preview"), configurable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), configurable: true });
});

afterEach(() => {
  mockedUseAuth.mockReset();
});

// ============================================================
// 正常路径
// ============================================================

describe("SettingsProfileForm 正常路径", () => {
  it("有用户时渲染表单，昵称预填，无改动时保存按钮禁用", () => {
    mockAuth({ currentUser: makeUser("u1", "小明") });
    render(<SettingsProfileForm />);

    expect((screen.getByLabelText("昵称") as HTMLInputElement).value).toBe("小明");
    expect(screen.getByRole("button", { name: "保存资料" })).toBeDisabled();
  });

  it("修改昵称后保存按钮启用，提交调用 updateProfile", async () => {
    mockAuth({ currentUser: makeUser("u1", "小明") });
    render(<SettingsProfileForm />);

    fireEvent.change(screen.getByLabelText("昵称"), { target: { value: "新昵称" } });
    const save = screen.getByRole("button", { name: "保存资料" });
    expect(save).toBeEnabled();

    fireEvent.click(save);
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile).toHaveBeenCalledWith({ nickname: "新昵称", avatarFile: null });
  });

  it("选择头像文件后提交带 avatarFile", async () => {
    mockAuth({ currentUser: makeUser("u1", "小明") });
    render(<SettingsProfileForm />);

    const file = new File(["data"], "avatar.png", { type: "image/png" });
    const fileInput = screen.getByLabelText("选择新头像文件") as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    // 文件选择后直接更新头像预览（img src 为 mock 的 blob URL）
    expect(document.querySelector("img")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "保存资料" }));
    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1));
    expect(updateProfile).toHaveBeenCalledWith({ nickname: "小明", avatarFile: file });
  });

  it("点击头像会打开隐藏的文件选择器", () => {
    render(<SettingsProfileForm />);
    const fileInput = screen.getByLabelText("选择新头像文件") as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, "click");

    fireEvent.click(screen.getByRole("button", { name: "更换头像" }));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("选择头像")).toBeNull();
  });
});

// ============================================================
// 边界条件
// ============================================================

describe("SettingsProfileForm 边界条件", () => {
  it("currentUser 为 null 时返回 null（守卫放最前）", () => {
    mockAuth({ currentUser: null });
    const { container } = render(<SettingsProfileForm />);
    expect(container.firstChild).toBeNull();
  });

  it("昵称改回原值后 hasChanges 为 false，按钮重新禁用", () => {
    mockAuth({ currentUser: makeUser("u1", "小明") });
    render(<SettingsProfileForm />);

    const input = screen.getByLabelText("昵称");
    fireEvent.change(input, { target: { value: "小红" } });
    expect(screen.getByRole("button", { name: "保存资料" })).toBeEnabled();

    fireEvent.change(input, { target: { value: "小明" } });
    expect(screen.getByRole("button", { name: "保存资料" })).toBeDisabled();
  });
});

// ============================================================
// 错误路径
// ============================================================

describe("SettingsProfileForm 错误路径", () => {
  it("profileSaving 时按钮禁用且文案为保存中", () => {
    mockAuth({ profileSaving: true });
    render(<SettingsProfileForm />);
    expect(screen.getByRole("button", { name: "保存中" })).toBeDisabled();
  });

  it("profileError 时渲染错误文案", () => {
    mockAuth({ profileError: "昵称已被占用" });
    render(<SettingsProfileForm />);
    expect(screen.getByText("昵称已被占用")).toBeTruthy();
  });
});

// ============================================================
// 状态转换
// ============================================================

describe("SettingsProfileForm 状态转换", () => {
  it("user 变化后 useEffect 重置昵称", () => {
    const { rerender } = render(<SettingsProfileForm />);

    fireEvent.change(screen.getByLabelText("昵称"), { target: { value: "手改昵称" } });
    mockAuth({ currentUser: makeUser("u1", "改名后") });
    rerender(<SettingsProfileForm />);

    expect((screen.getByLabelText("昵称") as HTMLInputElement).value).toBe("改名后");
  });

  it("profileSaved 且无改动时显示已保存；有改动时回到保存资料", () => {
    mockAuth({ profileSaved: true });
    render(<SettingsProfileForm />);
    expect(screen.getByRole("button", { name: "已保存" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("昵称"), { target: { value: "临时改动" } });
    expect(screen.getByRole("button", { name: "保存资料" })).toBeEnabled();
  });
});
