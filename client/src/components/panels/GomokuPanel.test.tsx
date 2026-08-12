// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../test-setup";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { GomokuGame, PresenceUser, UserProfile } from "@xiaoelong/shared";
import { useAuth, type AuthContextValue } from "../../contexts/AuthContext";
import { useChat, type ChatContextValue } from "../../contexts/ChatContext";
import { useGomoku, type GomokuContextValue } from "../../contexts/GomokuContext";
import { GomokuPanel } from "./GomokuPanel";

// ============================================================
// Mock 依赖：AuthContext / ChatContext / GomokuContext / UserAvatar
// ============================================================

vi.mock("../../contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../contexts/ChatContext", () => ({ useChat: vi.fn() }));
vi.mock("../../contexts/GomokuContext", () => ({ useGomoku: vi.fn() }));
vi.mock("../atoms/UserAvatar", () => ({
  UserAvatar: () => <span data-testid="user-avatar" />
}));

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseChat = vi.mocked(useChat);
const mockedUseGomoku = vi.mocked(useGomoku);

function makeUser(id = "u1", nickname = "小明"): UserProfile {
  return { id, nickname, avatarUrl: null, createdAt: "2026-01-01" };
}

function makePresenceUser(id = "u1", isOnline = true, nickname = "用户"): PresenceUser {
  return { ...makeUser(id, nickname), isOnline, todayMood: null };
}

function makeGame(overrides: Partial<GomokuGame> = {}): GomokuGame {
  const emptyBoard = Array.from({ length: 15 }, () => Array<number>(15).fill(0));
  return {
    id: 1,
    status: "playing",
    playerBlack: makeUser("u1", "小黑"),
    playerWhite: makeUser("u2", "小白"),
    currentTurn: "u1",
    winner: null,
    boardState: emptyBoard,
    invitedBy: "u2",
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    ...overrides
  };
}

let selectGame: ReturnType<typeof vi.fn>;
let invite: ReturnType<typeof vi.fn>;
let accept: ReturnType<typeof vi.fn>;
let reject: ReturnType<typeof vi.fn>;
let move: ReturnType<typeof vi.fn>;
let refresh: ReturnType<typeof vi.fn>;

function mockGomoku(overrides: Partial<Pick<GomokuContextValue, "games" | "selectedGameId" | "loading" | "error">> = {}): void {
  mockedUseGomoku.mockReturnValue({
    games: [],
    selectedGameId: null,
    loading: false,
    error: null,
    selectGame,
    invite,
    accept,
    reject,
    move,
    refresh,
    ...overrides
  } as unknown as GomokuContextValue);
}

beforeEach(() => {
  selectGame = vi.fn();
  invite = vi.fn().mockResolvedValue(undefined);
  accept = vi.fn().mockResolvedValue(undefined);
  reject = vi.fn().mockResolvedValue(undefined);
  move = vi.fn().mockResolvedValue(true);
  refresh = vi.fn();

  mockedUseAuth.mockReturnValue({ currentUser: makeUser("u1", "小明") } as unknown as AuthContextValue);
  mockedUseChat.mockReturnValue({ presenceUsers: [] } as unknown as ChatContextValue);
  mockGomoku();
});

afterEach(() => {
  mockedUseAuth.mockReset();
  mockedUseChat.mockReset();
  mockedUseGomoku.mockReset();
});

// ============================================================
// 正常路径
// ============================================================

describe("GomokuPanel 正常路径", () => {
  it("有对局时渲染对局列表、选中棋盘与对手信息", () => {
    const game = makeGame({ status: "playing", currentTurn: "u1" });
    mockGomoku({ games: [game], selectedGameId: game.id });
    render(<GomokuPanel />);

    expect(screen.getByText(/对手：小白，你执黑/)).toBeTruthy();
    expect(screen.getAllByText("轮到小黑行棋").length).toBeGreaterThan(0);
    expect(screen.getByRole("grid")).toBeTruthy();
  });

  it("点击对局项调用 selectGame", () => {
    const game = makeGame({ id: 5 });
    mockGomoku({ games: [game], selectedGameId: null });
    render(<GomokuPanel />);

    fireEvent.click(screen.getByRole("button", { name: /小白/ }));
    expect(selectGame).toHaveBeenCalledWith(5);
  });

  it("被邀请方显示接受/拒绝并调用 accept/reject", () => {
    const game = makeGame({
      id: 3,
      status: "invited",
      playerBlack: makeUser("u2", "小白"),
      playerWhite: makeUser("u1", "小明"),
      currentTurn: null,
      winner: null,
      invitedBy: "u2"
    });
    mockGomoku({ games: [game], selectedGameId: game.id });
    render(<GomokuPanel />);

    fireEvent.click(screen.getByRole("button", { name: "接受邀请" }));
    expect(accept).toHaveBeenCalledWith(3);

    fireEvent.click(screen.getByRole("button", { name: "拒绝" }));
    expect(reject).toHaveBeenCalledWith(3);
  });

  it("邀请弹窗列出候选（排除自己、在线在前），点击调用 invite 并关闭", async () => {
    mockedUseAuth.mockReturnValue({ currentUser: makeUser("u1", "小明") } as unknown as AuthContextValue);
    mockedUseChat.mockReturnValue({
      presenceUsers: [
        makePresenceUser("u1", true, "小明"),
        makePresenceUser("u3", false, "丙"),
        makePresenceUser("u2", true, "乙")
      ]
    } as unknown as ChatContextValue);
    mockGomoku({ games: [], selectedGameId: null });
    render(<GomokuPanel />);

    fireEvent.click(screen.getByRole("button", { name: "邀请" }));
    expect(screen.getByText("选择成员")).toBeTruthy();

    // 在线（乙）在离线（丙）之前，自己（小明）不在列表
    const candidates = Array.from(document.querySelectorAll(".invite-candidate"))
      .map((el) => (el as HTMLElement).textContent);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toContain("乙");
    expect(candidates[1]).toContain("丙");

    fireEvent.click(screen.getByRole("button", { name: /乙/ }));
    await waitFor(() => expect(invite).toHaveBeenCalledWith("u2"));
    await waitFor(() => expect(screen.queryByText("选择成员")).toBeNull());
  });

  it("点击刷新调用 refresh", () => {
    mockGomoku({ games: [], selectedGameId: null });
    render(<GomokuPanel />);

    fireEvent.click(screen.getByRole("button", { name: "刷新" }));
    expect(refresh).toHaveBeenCalled();
  });
});

// ============================================================
// 边界条件
// ============================================================

describe("GomokuPanel 边界条件", () => {
  it("currentUser 为 null 时返回 null（守卫在 hooks 后）", () => {
    mockedUseAuth.mockReturnValue({ currentUser: null } as unknown as AuthContextValue);
    const { container } = render(<GomokuPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("games 为空时显示空提示与无选中提示", () => {
    mockGomoku({ games: [], selectedGameId: null });
    render(<GomokuPanel />);

    expect(screen.getByText("还没有对局。")).toBeTruthy();
    expect(screen.getByText("先邀请一位成员开始对局。")).toBeTruthy();
  });

  it("候选与我有进行中对局时按钮禁用并标注", () => {
    const game = makeGame({ id: 1, status: "playing", playerWhite: makeUser("u2", "乙") });
    mockedUseChat.mockReturnValue({
      presenceUsers: [makePresenceUser("u1", true, "小明"), makePresenceUser("u2", true, "乙")]
    } as unknown as ChatContextValue);
    mockGomoku({ games: [game], selectedGameId: game.id });
    render(<GomokuPanel />);

    fireEvent.click(screen.getByRole("button", { name: "邀请" }));
    const candidate = screen.getByRole("button", { name: /对局进行中/ }) as HTMLButtonElement;
    expect(candidate.disabled).toBe(true);
    expect(candidate.textContent).toContain("对局进行中");
  });
});

// ============================================================
// 错误路径
// ============================================================

describe("GomokuPanel 错误路径", () => {
  it("error 非空时渲染错误文案", () => {
    mockGomoku({ games: [], selectedGameId: null, error: "加载失败" });
    render(<GomokuPanel />);
    expect(screen.getByText("加载失败")).toBeTruthy();
  });

  it("loading 时显示加载中", () => {
    mockGomoku({ games: [], selectedGameId: null, loading: true });
    render(<GomokuPanel />);
    expect(screen.getByText("加载中...")).toBeTruthy();
  });
});

// ============================================================
// 状态转换
// ============================================================

describe("GomokuPanel 状态转换", () => {
  it("invite 挂起期间候选禁用，防重复邀请", async () => {
    let resolveInvite: () => void = () => {};
    invite.mockReturnValue(new Promise<void>((resolve) => { resolveInvite = resolve; }));

    mockedUseChat.mockReturnValue({
      presenceUsers: [makePresenceUser("u1", true, "小明"), makePresenceUser("u2", true, "乙")]
    } as unknown as ChatContextValue);
    mockGomoku({ games: [], selectedGameId: null });
    render(<GomokuPanel />);

    fireEvent.click(screen.getByRole("button", { name: "邀请" }));
    fireEvent.click(screen.getByRole("button", { name: /乙/ }));

    // invitingUserId 已 set 且 invite 未 resolve → 候选禁用
    const candidate = screen.getByRole("button", { name: /乙/ }) as HTMLButtonElement;
    expect(candidate.disabled).toBe(true);
    // resolve 后 handleInvite 的异步 setState 需在 act 内完成，避免 React warning
    await act(async () => {
      resolveInvite();
    });
  });
});
