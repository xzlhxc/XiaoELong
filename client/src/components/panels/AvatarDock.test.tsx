// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../test-setup";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DailyMood, MoodEmoji, UserProfile } from "@xiaoelong/shared";
import { useAuth, type AuthContextValue } from "../../contexts/AuthContext";
import { useDaily, type DailyContextValue } from "../../contexts/DailyContext";
import { useDesktop, type DesktopContextValue } from "../../contexts/DesktopContext";
import { AvatarDock } from "./AvatarDock";

// ============================================================
// Mock 依赖：AuthContext / DailyContext / DesktopContext / UserAvatar / PetSprite
// ============================================================

vi.mock("../../contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../contexts/DailyContext", () => ({ useDaily: vi.fn() }));
vi.mock("../../contexts/DesktopContext", () => ({ useDesktop: vi.fn() }));
vi.mock("../atoms/UserAvatar", () => ({
  UserAvatar: () => <span data-testid="user-avatar" />
}));
// PetSprite 涉及 canvas/贴图加载，替换为占位组件（ref 提供 isOpaqueAt 供命中测试）
vi.mock("../atoms/PetSprite", async (importOriginal) => {
  const React = await import("react");
  const MockPetSprite = React.forwardRef((_props, ref) => {
    React.useImperativeHandle(ref, () => ({ isOpaqueAt: () => true }));
    return <div data-testid="pet-sprite" />;
  });
  MockPetSprite.displayName = "MockPetSprite";
  return { PetSprite: MockPetSprite };
});

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseDaily = vi.mocked(useDaily);
const mockedUseDesktop = vi.mocked(useDesktop);

function makeUser(id = "u1", nickname = "小明"): UserProfile {
  return { id, nickname, avatarUrl: null, createdAt: "2026-01-01" };
}

function makeDailyMood(emoji: MoodEmoji = "😊"): DailyMood {
  return { userId: "u1", moodDay: "2026-08-11", emoji, updatedAt: "2026-08-11T00:00:00.000Z" };
}

interface MoodStatusShape {
  shouldPrompt: boolean;
  mood: DailyMood | null;
}

let selectMood: ReturnType<typeof vi.fn>;
let setMoodPromptVisibleSpy: ReturnType<typeof vi.fn>;

function mockDaily(overrides: {
  moodStatus?: MoodStatusShape | null;
  moodOptions?: MoodEmoji[];
} = {}): void {
  mockedUseDaily.mockReturnValue({
    moodStatus: null,
    moodOptions: ["😊", "🥰"],
    moodLoading: false,
    selectMood,
    ...overrides
  } as unknown as DailyContextValue);
}

function mockDesktop(overrides: Partial<Pick<DesktopContextValue, "desktopRole" | "panelOpen">> = {}): void {
  mockedUseDesktop.mockReturnValue({
    desktopRole: "avatar",
    panelOpen: false,
    petReaction: null,
    desktopSettings: { petDisplayMode: "dynamic", openAtLogin: false, panelAlwaysOnTop: false },
    togglePanel: vi.fn(),
    openSettings: vi.fn(),
    ...overrides
  } as unknown as DesktopContextValue);
}

beforeEach(() => {
  selectMood = vi.fn().mockResolvedValue(undefined);
  setMoodPromptVisibleSpy = vi.fn();

  mockedUseAuth.mockReturnValue({ currentUser: makeUser("u1", "小明") } as unknown as AuthContextValue);
  mockDaily();
  mockDesktop();

  (window as unknown as { xiaoelongDesktop: unknown }).xiaoelongDesktop = {
    isDesktop: true,
    setMoodPromptVisible: setMoodPromptVisibleSpy,
    setAvatarClickThrough: vi.fn(),
    startDrag: vi.fn(),
    endDrag: vi.fn(),
    moveDrag: vi.fn()
  };
});

afterEach(() => {
  cleanup();
  mockedUseAuth.mockReset();
  mockedUseDaily.mockReset();
  mockedUseDesktop.mockReset();
  delete (window as unknown as { xiaoelongDesktop?: unknown }).xiaoelongDesktop;
});

// ============================================================
// 正常路径
// ============================================================

describe("AvatarDock 正常路径", () => {
  it("moodPrompt 条件满足时渲染气泡，点 emoji 调 selectMood", () => {
    mockDaily({ moodStatus: { shouldPrompt: true, mood: makeDailyMood("😊") } });
    render(<AvatarDock />);

    expect(screen.getByRole("dialog", { name: "每日心情" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "😊" }));
    expect(selectMood).toHaveBeenCalledWith("😊");
  });

  it("面板按钮 aria-label 包含当前用户昵称", () => {
    render(<AvatarDock />);
    expect(screen.getByRole("button", { name: /当前用户 小明/ })).toBeTruthy();
  });
});

// ============================================================
// 边界条件（moodPrompt 派生四条件组合）
// ============================================================

describe("AvatarDock moodPrompt 派生", () => {
  it.each<[string, Partial<Pick<DesktopContextValue, "desktopRole" | "panelOpen">>, MoodStatusShape | null]>([
    ["desktopRole 非 avatar", { desktopRole: "panel" }, { shouldPrompt: true, mood: null }],
    ["panelOpen 为 true", { desktopRole: "avatar", panelOpen: true }, { shouldPrompt: true, mood: null }],
    ["shouldPrompt 为 false", { desktopRole: "avatar", panelOpen: false }, { shouldPrompt: false, mood: null }],
    ["moodStatus 为 null", { desktopRole: "avatar", panelOpen: false }, null]
  ])("%s 时不渲染心情气泡", (_name, desktopOverrides, moodStatus) => {
    mockDesktop(desktopOverrides);
    mockDaily({ moodStatus });
    render(<AvatarDock />);
    expect(screen.queryByRole("dialog", { name: "每日心情" })).toBeNull();
  });

  it("currentUser 为 null 时返回 null（守卫在 hooks 后）", () => {
    mockedUseAuth.mockReturnValue({ currentUser: null } as unknown as AuthContextValue);
    const { container } = render(<AvatarDock />);
    expect(container.firstChild).toBeNull();
  });
});

// ============================================================
// 状态转换（setMoodPromptVisible 与壳层同步）
// ============================================================

describe("AvatarDock setMoodPromptVisible 同步", () => {
  it("avatar 角色挂载调 setMoodPromptVisible(true)，卸载调 false", () => {
    mockDaily({ moodStatus: { shouldPrompt: true, mood: null } });
    const { unmount } = render(<AvatarDock />);
    expect(setMoodPromptVisibleSpy).toHaveBeenLastCalledWith(true);

    unmount();
    expect(setMoodPromptVisibleSpy).toHaveBeenLastCalledWith(false);
  });

  it("desktopRole 非 avatar 时不调用 setMoodPromptVisible", () => {
    mockDesktop({ desktopRole: "panel" });
    render(<AvatarDock />);
    expect(setMoodPromptVisibleSpy).not.toHaveBeenCalled();
  });

  it("avatar 角色 moodStatus 为 null 时不渲染气泡且挂载即通知 false", () => {
    mockDaily({ moodStatus: null });
    render(<AvatarDock />);
    expect(screen.queryByRole("dialog", { name: "每日心情" })).toBeNull();
    expect(setMoodPromptVisibleSpy).toHaveBeenLastCalledWith(false);
  });
});
