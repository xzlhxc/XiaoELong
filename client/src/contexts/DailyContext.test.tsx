// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../test-setup";
import { act, render, renderHook, screen } from "@testing-library/react";
import {
  MOOD_OPTIONS,
  type DailyMood,
  type DailyMoodTodayResponse,
  type DailyQuestion,
  type DailyQuestionStats,
  type DailyQuestionTodayResponse,
  type DailyQuestionVoter,
  type MoodEmoji
} from "@xiaoelong/shared";
import {
  dailyReducer,
  createInitialState,
  DailyProvider,
  useDaily,
  type DailyAction,
  type DailyState
} from "./DailyContext";
import { useAuth, type AuthContextValue } from "./AuthContext";
import { useChat, type ChatContextValue } from "./ChatContext";
import { useDesktop, type DesktopContextValue } from "./DesktopContext";

// ============================================================
// Mock 依赖：socket.ts / api.ts / AuthContext / DesktopContext
// ============================================================

/**
 * 可控假 socket（与 ChatContext 测试同款）：
 * - on/off 记录监听器，可手动 _trigger 事件（模拟服务器下发）
 */
const socketMock = vi.hoisted(() => {
  let sharedSocket: {
    connected: boolean;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    off: (event: string, handler: (...args: unknown[]) => void) => void;
    disconnect: () => void;
    _listeners: Map<string, Set<(...args: unknown[]) => void>>;
    _trigger: (event: string, payload: unknown) => void;
  } | null = null;

  function createFakeSocket() {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    sharedSocket = {
      connected: true,
      on(event, handler) {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(handler);
      },
      off(event, handler) {
        listeners.get(event)?.delete(handler);
      },
      disconnect() {},
      _listeners: listeners,
      _trigger(event, payload) {
        listeners.get(event)?.forEach((handler) => handler(payload));
      }
    };
    return sharedSocket;
  }

  return {
    createFakeSocket,
    /** 返回当前假 socket（effect 建的那个），未建则 null */
    getShared: () => sharedSocket,
    reset: () => {
      sharedSocket = null;
    }
  };
});

vi.mock("../services/socket", () => ({
  getOrCreateSocket: () => socketMock.createFakeSocket(),
  getSharedSocket: () => socketMock.getShared()
}));

/** 可控 api mock：每日一题 + 心情的 4 个函数 */
const apiMock = vi.hoisted(() => ({
  getTodayQuestion: vi.fn(),
  submitTodayAnswer: vi.fn(),
  getTodayMood: vi.fn(),
  setTodayMood: vi.fn()
}));

vi.mock("../services/api", () => ({
  getTodayQuestion: apiMock.getTodayQuestion,
  submitTodayAnswer: apiMock.submitTodayAnswer,
  getTodayMood: apiMock.getTodayMood,
  setTodayMood: apiMock.setTodayMood
}));

vi.mock("./AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("./ChatContext", () => ({ useChat: vi.fn() }));
vi.mock("./DesktopContext", () => ({ useDesktop: vi.fn() }));

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseChat = vi.mocked(useChat);
const mockedUseDesktop = vi.mocked(useDesktop);
const updateMoodForUserMock = vi.fn();

/**
 * DailyContext 从 useAuth 解构 token / currentUserId / currentUser，
 * 从 useDesktop 解构 desktopRole，这里只 mock 这几个字段。
 */
function mockAuth(token: string | null, currentUserId: string | null, currentUser?: unknown): void {
  mockedUseAuth.mockReturnValue({ token, currentUserId, currentUser: currentUser ?? null } as unknown as AuthContextValue);
}

function mockDesktop(desktopRole: string): void {
  mockedUseDesktop.mockReturnValue({ desktopRole } as unknown as DesktopContextValue);
}

// ============================================================
// 辅助函数
// ============================================================

function makeState(overrides?: Partial<DailyState>): DailyState {
  return { ...createInitialState(), ...overrides };
}

function makeUser(id = "u1", nickname = "用户"): { id: string; nickname: string; avatarUrl: null; createdAt: string } {
  return { id, nickname, avatarUrl: null, createdAt: "2026-01-01" };
}

function makeVoter(id = "u1", nickname = "用户"): DailyQuestionVoter {
  return { ...makeUser(id, nickname), answeredAt: "2026-08-11T00:00:00.000Z" };
}

function makeStats(overrides?: Partial<DailyQuestionStats>): DailyQuestionStats {
  return {
    questionId: 1,
    counts: [2, 1],
    totalAnswers: 3,
    voters: [[makeVoter("u1")], [makeVoter("u2")]],
    ...overrides
  };
}

function makeQuestion(id = 1): DailyQuestion {
  return {
    id,
    date: "2026-08-11",
    category: "逻辑",
    question: "1+1=?",
    options: ["2", "3"],
    visual: null,
    sourceType: "manual",
    sourceContext: null,
    createdAt: "2026-08-11T00:00:00.000Z"
  };
}

function makeDailyData(overrides?: Partial<DailyQuestionTodayResponse>): DailyQuestionTodayResponse {
  return {
    question: makeQuestion(),
    stats: makeStats(),
    answeredIndex: null,
    result: null,
    ...overrides
  };
}

function makeMood(userId = "u1", emoji: MoodEmoji = "😊"): DailyMood {
  return { userId, moodDay: "2026-08-11", emoji, updatedAt: "2026-08-11T00:00:00.000Z" };
}

function makeMoodStatus(overrides?: Partial<DailyMoodTodayResponse>): DailyMoodTodayResponse {
  return {
    moodDay: "2026-08-11",
    mood: null,
    options: [...MOOD_OPTIONS],
    shouldPrompt: true,
    ...overrides
  };
}

/** 挂载 DailyProvider 并 flush 数据加载 effect 的 async dispatch */
async function renderDaily() {
  const utils = renderHook(() => useDaily(), { wrapper: DailyProvider });
  await act(async () => {});
  return utils;
}

// ============================================================
// 全局 mock 默认值
// ============================================================

beforeEach(() => {
  socketMock.reset();
  mockedUseAuth.mockReset();
  mockedUseChat.mockReset();
  mockedUseDesktop.mockReset();
  apiMock.getTodayQuestion.mockReset();
  apiMock.submitTodayAnswer.mockReset();
  apiMock.getTodayMood.mockReset();
  apiMock.setTodayMood.mockReset();

  // 默认登录态：有 token + 有用户；角色为 single（全功能）；数据正常返回
  mockAuth("t1", "u1", makeUser("u1"));
  mockedUseChat.mockReturnValue({ updateMoodForUser: updateMoodForUserMock } as unknown as ChatContextValue);
  updateMoodForUserMock.mockReset();
  mockDesktop("single");
  apiMock.getTodayQuestion.mockResolvedValue(makeDailyData());
  apiMock.getTodayMood.mockResolvedValue(makeMoodStatus());
});

afterEach(() => {
  mockedUseAuth.mockReset();
  mockedUseChat.mockReset();
  mockedUseDesktop.mockReset();
});

// ============================================================
// createInitialState 测试
// ============================================================

describe("createInitialState", () => {
  it("五个字段全部为初始值", () => {
    const state = createInitialState();
    expect(state.dailyData).toBeNull();
    expect(state.moodStatus).toBeNull();
    expect(state.dailyError).toBeNull();
    expect(state.dailyLoading).toBe(false);
    expect(state.moodLoading).toBe(false);
  });
});

// ============================================================
// dailyReducer — 正常路径
// ============================================================

describe("dailyReducer 正常路径", () => {
  it("SET_DAILY_DATA 全量替换 dailyData", () => {
    const state = makeState({ dailyData: makeDailyData() });
    const next = dailyReducer(state, { type: "SET_DAILY_DATA", payload: null });
    expect(next.dailyData).toBeNull();
  });

  it("SET_MOOD_STATUS 全量替换 moodStatus", () => {
    const state = makeState({ moodStatus: makeMoodStatus() });
    const next = dailyReducer(state, { type: "SET_MOOD_STATUS", payload: null });
    expect(next.moodStatus).toBeNull();
  });

  it("UPDATE_DAILY_STATS 匹配 questionId → stats 被广播值替换", () => {
    const state = makeState({ dailyData: makeDailyData() });
    const action: DailyAction = {
      type: "UPDATE_DAILY_STATS",
      payload: { questionId: 1, stats: makeStats({ counts: [5, 5], totalAnswers: 10 }) }
    };
    const next = dailyReducer(state, action);
    expect(next.dailyData?.stats.totalAnswers).toBe(10);
    expect(next.dailyData?.stats.counts).toEqual([5, 5]);
  });

  it("UPDATE_DAILY_VOTERS 匹配用户资料更新，不匹配的不变", () => {
    const state = makeState({ dailyData: makeDailyData() });
    const action: DailyAction = { type: "UPDATE_DAILY_VOTERS", payload: makeVoter("u1", "新名") };
    const next = dailyReducer(state, action);
    const voters = next.dailyData!.stats.voters;
    expect(voters[0][0].nickname).toBe("新名");
    expect(voters[1][0].nickname).toBe("用户");
  });

  it("UPDATE_MOOD_FROM_SOCKET 更新 moodStatus（shouldPrompt 置 false）", () => {
    const state = makeState({ moodStatus: makeMoodStatus() });
    const action: DailyAction = { type: "UPDATE_MOOD_FROM_SOCKET", payload: { userId: "u1", mood: makeMood("u1") } };
    const next = dailyReducer(state, action);
    expect(next.moodStatus?.mood).toEqual(makeMood("u1"));
    expect(next.moodStatus?.shouldPrompt).toBe(false);
    expect(next.moodStatus?.moodDay).toBe("2026-08-11");
  });

  it("SET_DAILY_LOADING / SET_MOOD_LOADING / SET_DAILY_ERROR 各自设置字段", () => {
    let next = dailyReducer(makeState(), { type: "SET_DAILY_LOADING", payload: true });
    expect(next.dailyLoading).toBe(true);
    next = dailyReducer(next, { type: "SET_MOOD_LOADING", payload: true });
    expect(next.moodLoading).toBe(true);
    next = dailyReducer(next, { type: "SET_DAILY_ERROR", payload: "出错" });
    expect(next.dailyError).toBe("出错");
  });
});

// ============================================================
// dailyReducer — 边界条件
// ============================================================

describe("dailyReducer 边界条件", () => {
  it("UPDATE_DAILY_STATS questionId 不匹配 → 返回原 state", () => {
    const state = makeState({ dailyData: makeDailyData() });
    const action: DailyAction = {
      type: "UPDATE_DAILY_STATS",
      payload: { questionId: 999, stats: makeStats() }
    };
    const next = dailyReducer(state, action);
    expect(next).toBe(state);
    expect(next.dailyData?.stats.totalAnswers).toBe(3);
  });

  it("UPDATE_DAILY_STATS 但 dailyData 为 null → 不崩溃，返回原 state", () => {
    const state = makeState();
    const action: DailyAction = { type: "UPDATE_DAILY_STATS", payload: { questionId: 1, stats: makeStats() } };
    const next = dailyReducer(state, action);
    expect(next).toBe(state);
  });

  it("UPDATE_DAILY_VOTERS 但 dailyData 为 null → 不崩溃，返回原 state", () => {
    const state = makeState();
    const next = dailyReducer(state, { type: "UPDATE_DAILY_VOTERS", payload: makeVoter("u1") });
    expect(next.dailyData).toBeNull();
  });

  it("UPDATE_MOOD_FROM_SOCKET 但 moodStatus 为 null → options 用默认 MOOD_OPTIONS 兜底", () => {
    const state = makeState();
    const action: DailyAction = { type: "UPDATE_MOOD_FROM_SOCKET", payload: { userId: "u1", mood: makeMood("u1") } };
    const next = dailyReducer(state, action);
    expect(next.moodStatus?.options).toEqual([...MOOD_OPTIONS]);
    expect(next.moodStatus?.mood).toEqual(makeMood("u1"));
  });

  it("CLEAR 重置所有字段到初始值", () => {
    const state = makeState({ dailyData: makeDailyData(), moodStatus: makeMoodStatus(), dailyError: "x", dailyLoading: true, moodLoading: true });
    const next = dailyReducer(state, { type: "CLEAR" });
    expect(next).toEqual(createInitialState());
  });
});

// ============================================================
// Provider — 数据加载
// ============================================================

describe("数据加载", () => {
  it("登录（非 auth/avatar）→ 同时加载每日一题和心情", async () => {
    const { result } = await renderDaily();
    expect(apiMock.getTodayQuestion).toHaveBeenCalledTimes(1);
    expect(apiMock.getTodayMood).toHaveBeenCalledTimes(1);
    expect(result.current.dailyData).toEqual(makeDailyData());
    expect(result.current.moodStatus).toEqual(makeMoodStatus());
  });

  it("avatar 角色 → 只加载心情，不加载每日一题", async () => {
    mockDesktop("avatar");
    const { result } = await renderDaily();
    expect(apiMock.getTodayMood).toHaveBeenCalledTimes(1);
    expect(apiMock.getTodayQuestion).not.toHaveBeenCalled();
    expect(result.current.moodStatus).toEqual(makeMoodStatus());
    expect(result.current.dailyData).toBeNull();
  });

  it("未登录（token=null）→ 不调 api、不建 socket", async () => {
    mockAuth(null, null);
    await renderDaily();
    expect(apiMock.getTodayQuestion).not.toHaveBeenCalled();
    expect(apiMock.getTodayMood).not.toHaveBeenCalled();
    expect(socketMock.getShared()).toBeNull();
  });

  it("getTodayQuestion 失败 → dailyError 设置、dailyLoading 复位", async () => {
    apiMock.getTodayQuestion.mockRejectedValue(new Error("network down"));
    const { result } = await renderDaily();
    expect(result.current.dailyError).toBe("network down");
    expect(result.current.dailyLoading).toBe(false);
  });

  it("getTodayMood 失败 → moodStatus 静默置 null", async () => {
    apiMock.getTodayMood.mockRejectedValue(new Error("boom"));
    const { result } = await renderDaily();
    expect(result.current.moodStatus).toBeNull();
  });
});

// ============================================================
// Provider — Socket 监听
// ============================================================

describe("Socket 监听", () => {
  it("收到 question:update → dailyData.stats 更新", async () => {
    const { result } = await renderDaily();
    act(() => {
      socketMock.getShared()!._trigger("question:update", {
        questionId: 1,
        stats: makeStats({ counts: [7, 1], totalAnswers: 8 })
      });
    });
    expect(result.current.dailyData?.stats.totalAnswers).toBe(8);
  });

  it("收到 mood:update（自己的 userId）→ moodStatus 更新", async () => {
    const { result } = await renderDaily();
    act(() => {
      socketMock.getShared()!._trigger("mood:update", { userId: "u1", mood: makeMood("u1") });
    });
    expect(result.current.moodStatus?.mood).toEqual(makeMood("u1"));
  });

  it("收到 mood:update（别人的 userId）→ moodStatus 不变（忽略）", async () => {
    const { result } = await renderDaily();
    act(() => {
      socketMock.getShared()!._trigger("mood:update", { userId: "u2", mood: makeMood("u2") });
    });
    expect(result.current.moodStatus?.mood).toBeNull();
  });

  it("收到 user:update → voters 里用户资料更新", async () => {
    const { result } = await renderDaily();
    act(() => {
      socketMock.getShared()!._trigger("user:update", { user: makeVoter("u1", "新名") });
    });
    expect(result.current.dailyData?.stats.voters[0][0].nickname).toBe("新名");
  });

  it("avatar 角色 → 只监听 mood:update，不监听 question:update / user:update", async () => {
    mockDesktop("avatar");
    await renderDaily();
    const socket = socketMock.getShared()!;
    expect(socket._listeners.has("mood:update")).toBe(true);
    expect(socket._listeners.has("question:update")).toBe(false);
    expect(socket._listeners.has("user:update")).toBe(false);
  });

  it("cleanup 时逐个 off 自己注册的监听器（共享 socket 不残留）", async () => {
    const { unmount } = await renderDaily();
    const socket = socketMock.getShared()!;
    expect(socket._listeners.get("mood:update")?.size).toBe(1);
    expect(socket._listeners.get("question:update")?.size).toBe(1);
    expect(socket._listeners.get("user:update")?.size).toBe(1);

    unmount();
    for (const handlers of socket._listeners.values()) {
      expect(handlers.size).toBe(0);
    }
  });
});

// ============================================================
// Provider — 操作
// ============================================================

describe("操作", () => {
  it("answerDaily 成功 → 更新 answeredIndex / stats / result", async () => {
    apiMock.submitTodayAnswer.mockResolvedValue({
      ok: true,
      stats: makeStats({ counts: [3, 1], totalAnswers: 4 }),
      answeredIndex: 0,
      result: { answeredIndex: 0, correctAnswerIndex: 0, isCorrect: true, explanation: "因为 1+1=2" }
    });
    const { result } = await renderDaily();

    await act(async () => {
      await result.current.answerDaily(0);
    });
    expect(result.current.dailyData?.answeredIndex).toBe(0);
    expect(result.current.dailyData?.stats.totalAnswers).toBe(4);
    expect(result.current.dailyData?.result?.isCorrect).toBe(true);
  });

  it("dailyData 为 null 时 answerDaily 直接返回，不调 api", async () => {
    apiMock.getTodayQuestion.mockRejectedValue(new Error("load fail"));
    const { result } = await renderDaily();
    expect(result.current.dailyData).toBeNull();

    await act(async () => {
      await result.current.answerDaily(0);
    });
    expect(apiMock.submitTodayAnswer).not.toHaveBeenCalled();
  });

  it("answerDaily 失败 → dailyError 设置", async () => {
    apiMock.submitTodayAnswer.mockRejectedValue(new Error("提交失败"));
    const { result } = await renderDaily();

    await act(async () => {
      await result.current.answerDaily(0);
    });
    expect(result.current.dailyError).toBe("提交失败");
  });

  it("selectMood 成功 → 乐观更新 moodStatus（shouldPrompt=false）", async () => {
    apiMock.setTodayMood.mockResolvedValue({ ok: true, moodDay: "2026-08-11", mood: makeMood("u1", "🥰") });
    const { result } = await renderDaily();

    await act(async () => {
      await result.current.selectMood("🥰");
    });
    expect(result.current.moodStatus?.mood?.emoji).toBe("🥰");
    expect(result.current.moodStatus?.shouldPrompt).toBe(false);
    expect(result.current.moodLoading).toBe(false);
    expect(updateMoodForUserMock).toHaveBeenCalledWith("u1", makeMood("u1", "🥰"));
  });

  it("selectMood 失败 → moodLoading 复位（finally 兜底）", async () => {
    apiMock.setTodayMood.mockRejectedValue(new Error("fail"));
    const { result } = await renderDaily();

    await act(async () => {
      await expect(result.current.selectMood("😊")).rejects.toThrow("fail");
    });
    expect(result.current.moodLoading).toBe(false);
  });

  it("moodOptions 派生：moodStatus 为空时用默认选项", async () => {
    apiMock.getTodayMood.mockResolvedValue(makeMoodStatus({ mood: null, shouldPrompt: true }));
    const { result } = await renderDaily();
    expect(result.current.moodOptions).toEqual([...MOOD_OPTIONS]);
  });
});

// ============================================================
// Provider — 轮询
// ============================================================

describe("轮询", () => {
  it("60 秒后 silent 刷新每日一题（不触发 loading/error）", async () => {
    vi.useFakeTimers();
    try {
      const { result } = await renderDaily();
      expect(apiMock.getTodayQuestion).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      expect(apiMock.getTodayQuestion).toHaveBeenCalledTimes(2);
      expect(result.current.dailyLoading).toBe(false);
      expect(result.current.dailyError).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ============================================================
// Provider / 状态转换
// ============================================================

describe("Provider / 状态转换", () => {
  it("useDaily 在 DailyProvider 外调用 → 抛错", () => {
    expect(() => renderHook(() => useDaily())).toThrow("useDaily must be used within DailyProvider");
  });

  it("DailyProvider 正常渲染子组件", async () => {
    render(
      <DailyProvider>
        <div data-testid="child">hello</div>
      </DailyProvider>
    );
    await act(async () => {});
    expect(screen.getByTestId("child").textContent).toBe("hello");
  });

  it("登出（token→null）→ CLEAR 被 dispatch，状态重置", async () => {
    const { result, rerender } = await renderDaily();
    expect(result.current.dailyData).toEqual(makeDailyData());

    mockAuth(null, null);
    rerender();

    expect(result.current.dailyData).toBeNull();
    expect(result.current.moodStatus).toBeNull();
    expect(result.current.dailyError).toBeNull();
  });
});
