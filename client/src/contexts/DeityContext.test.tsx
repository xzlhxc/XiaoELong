// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../test-setup";
import { act, renderHook } from "@testing-library/react";
import {
  type DeityId,
  type DeityStatus,
  type DeityWorshipRecord,
  type DeityWorshipResponse,
  type DeityWorshipTodayResponse
} from "@xiaoelong/shared";
import {
  createInitialState,
  deityReducer,
  DeityProvider,
  useDeity,
  type DeityAction,
  type DeityState
} from "./DeityContext";
import { useAuth, type AuthContextValue } from "./AuthContext";
import { useDesktop, type DesktopContextValue } from "./DesktopContext";

// ============================================================
// Mock 依赖：socket.ts / api.ts / AuthContext / DesktopContext / window.xiaoelongDesktop
// ============================================================

/**
 * 可控假 socket（与 Chat/Daily 测试同款）：
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

/** 可控 api mock：神选加载 + 膜拜提交；MockApiError 模拟 HTTP 状态码（409 用） */
const apiMock = vi.hoisted(() => {
  class MockApiError extends Error {
    statusCode: number;
    constructor(statusCode: number, message?: string) {
      super(message ?? `HTTP ${statusCode}`);
      this.statusCode = statusCode;
    }
  }
  return {
    MockApiError,
    getTodayDeityWorship: vi.fn(),
    submitDeityWorship: vi.fn()
  };
});

vi.mock("../services/api", () => ({
  getTodayDeityWorship: apiMock.getTodayDeityWorship,
  submitDeityWorship: apiMock.submitDeityWorship,
  ApiError: apiMock.MockApiError
}));

vi.mock("./AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("./DesktopContext", () => ({ useDesktop: vi.fn() }));

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseDesktop = vi.mocked(useDesktop);

/**
 * window.xiaoelongDesktop（Electron 桥）mock：
 * - 模块加载时（INITIAL_DIVINE_SESSION 读取）默认不存在 → 初始恒为非 divine 基线
 * - 各测试 render 前调用 assignToWindow() 按需注入，onDivineData/onDivineReturn 注册的回调被捕获到 listeners
 */
const desktopBridgeMock = vi.hoisted(() => {
  const listeners: {
    onDivineData?: (session: { requestId: number; data: DeityWorshipTodayResponse | null }) => void;
    onDivineReturn?: (divineState: { data: DeityWorshipTodayResponse | null }) => void;
  } = {};
  const bridge = {
    role: undefined as "auth" | "avatar" | "panel" | "divine" | "imageViewer" | undefined,
    isDesktop: false,
    onDivineData: vi.fn((cb: (session: { requestId: number; data: DeityWorshipTodayResponse | null }) => void) => {
      listeners.onDivineData = cb;
    }),
    onDivineReturn: vi.fn((cb: (divineState: { data: DeityWorshipTodayResponse | null }) => void) => {
      listeners.onDivineReturn = cb;
    }),
    updateDivineSelectionData: vi.fn(),
    notifyDivineReady: vi.fn(),
    openDivineSelection: vi.fn(),
    getInitialDivineData: vi.fn(() => null),
    getInitialDivineSession: vi.fn(() => ({ requestId: 0, data: null }))
  };
  return {
    bridge,
    listeners,
    assignToWindow() {
      (window as unknown as { xiaoelongDesktop: unknown }).xiaoelongDesktop = bridge;
    },
    clearFromWindow() {
      delete (window as unknown as { xiaoelongDesktop?: unknown }).xiaoelongDesktop;
    },
    reset() {
      listeners.onDivineData = undefined;
      listeners.onDivineReturn = undefined;
      bridge.onDivineData.mockClear();
      bridge.onDivineReturn.mockClear();
      bridge.updateDivineSelectionData.mockClear();
      bridge.notifyDivineReady.mockClear();
      bridge.openDivineSelection.mockClear();
      bridge.getInitialDivineData.mockClear();
      bridge.getInitialDivineSession.mockClear();
      bridge.role = undefined;
      bridge.isDesktop = false;
    }
  };
});

/**
 * DeityContext 从 useAuth 解构 token / currentUser / currentUserId / booting，
 * 从 useDesktop 解构 desktopRole / activeTab / setActiveTab，这里只 mock 这些字段。
 */
const setActiveTabMock = vi.fn();
function mockAuth(token: string | null, currentUserId: string | null, currentUser?: unknown, booting = false): void {
  mockedUseAuth.mockReturnValue({
    token,
    currentUserId,
    currentUser: currentUser ?? null,
    booting
  } as unknown as AuthContextValue);
}

function mockDesktop(desktopRole: string, activeTab = "chat"): void {
  mockedUseDesktop.mockReturnValue({
    desktopRole,
    activeTab,
    setActiveTab: setActiveTabMock
  } as unknown as DesktopContextValue);
}

// ============================================================
// 辅助函数
// ============================================================

function makeState(overrides?: Partial<DeityState>): DeityState {
  return { ...createInitialState(), ...overrides };
}

function makeUser(id = "u1", nickname = "用户"): { id: string; nickname: string; avatarUrl: null; createdAt: string } {
  return { id, nickname, avatarUrl: null, createdAt: "2026-01-01" };
}

function makeDeityStatus(overrides?: Partial<DeityStatus>): DeityStatus {
  return {
    deityId: "hu",
    totalWorships: 3,
    rank: "demigod",
    nextThreshold: 5,
    ...overrides
  };
}

function makeDeityData(overrides?: Partial<DeityWorshipTodayResponse>): DeityWorshipTodayResponse {
  return {
    worshipDay: "2026-08-11",
    todayWorship: null,
    deities: [
      makeDeityStatus(),
      makeDeityStatus({ deityId: "chui", totalWorships: 1, rank: "mortal", nextThreshold: 2 })
    ],
    ...overrides
  };
}

function makeWorshipRecord(deityId: DeityId = "hu"): DeityWorshipRecord {
  return { deityId, worshipDay: "2026-08-11", worshippedAt: "2026-08-11T00:00:00.000Z" };
}

function makeWorshipResponse(overrides?: Partial<DeityWorshipResponse>): DeityWorshipResponse {
  return {
    ...makeDeityData({
      todayWorship: makeWorshipRecord(),
      deities: [makeDeityStatus({ totalWorships: 4 }), makeDeityStatus({ deityId: "chui", totalWorships: 1, rank: "mortal", nextThreshold: 2 })]
    }),
    ok: true,
    blessing: "百🦌不萎加护",
    deity: makeDeityStatus({ totalWorships: 4 }),
    previousRank: "demigod",
    rankAdvanced: false,
    ...overrides
  };
}

/** 挂载 DeityProvider 并 flush 数据加载 effect 的 async dispatch */
async function renderDeity() {
  const utils = renderHook(() => useDeity(), { wrapper: DeityProvider });
  await act(async () => {});
  return utils;
}

// ============================================================
// 全局 mock 默认值
// ============================================================

beforeEach(() => {
  socketMock.reset();
  desktopBridgeMock.reset();
  desktopBridgeMock.clearFromWindow();
  mockedUseAuth.mockReset();
  mockedUseDesktop.mockReset();
  setActiveTabMock.mockReset();
  apiMock.getTodayDeityWorship.mockReset();
  apiMock.submitDeityWorship.mockReset();

  // 默认登录态：有 token + 有用户；角色为 single（全功能）；数据正常返回
  mockAuth("t1", "u1", makeUser("u1"));
  mockDesktop("single");
  apiMock.getTodayDeityWorship.mockResolvedValue(makeDeityData());
  apiMock.submitDeityWorship.mockResolvedValue(makeWorshipResponse());
});

afterEach(() => {
  mockedUseAuth.mockReset();
  mockedUseDesktop.mockReset();
  vi.useRealTimers();
});

// ============================================================
// createInitialState 测试
// ============================================================

describe("createInitialState", () => {
  // C11. 非 divine 角色（模块加载时 window 未注入）→ 六字段全初始值
  it("非 divine 角色 → 六个字段全部为初始值", () => {
    const state = createInitialState();
    expect(state.deityData).toBeNull();
    expect(state.deityError).toBeNull();
    expect(state.deityLoading).toBe(false);
    expect(state.deitySubmittingId).toBeNull();
    expect(state.divineViewSession).toBe(0);
    expect(state.divineRevealRequestId).toBe(0);
  });
});

// ============================================================
// deityReducer — 正常路径
// ============================================================

describe("deityReducer 正常路径", () => {
  // A1. SET_DEITY_DATA 全量替换 deityData（含 payload 为 null 时置空）
  it("SET_DEITY_DATA 全量替换 deityData", () => {
    const state = makeState({ deityData: makeDeityData() });
    const next = deityReducer(state, { type: "SET_DEITY_DATA", payload: null });
    expect(next.deityData).toBeNull();
  });

  // A2. UPDATE_DEITY_STATUS 匹配 deityId → 该项被替换，其余不变
  it("UPDATE_DEITY_STATUS 匹配 deityId → 替换该项，其余不变", () => {
    const state = makeState({ deityData: makeDeityData() });
    const action: DeityAction = {
      type: "UPDATE_DEITY_STATUS",
      payload: { deity: makeDeityStatus({ deityId: "hu", totalWorships: 9, rank: "true_god", nextThreshold: 10 }) }
    };
    const next = deityReducer(state, action);
    const hu = next.deityData!.deities.find((d) => d.deityId === "hu");
    expect(hu?.totalWorships).toBe(9);
    expect(hu?.rank).toBe("true_god");
    const chui = next.deityData!.deities.find((d) => d.deityId === "chui");
    expect(chui?.totalWorships).toBe(1);
  });

  // A3. SET_DEITY_LOADING / SET_DEITY_ERROR / SET_DEITY_SUBMITTING_ID 各设置字段
  it("SET_DEITY_LOADING / SET_DEITY_ERROR / SET_DEITY_SUBMITTING_ID 设置字段", () => {
    let next = deityReducer(makeState(), { type: "SET_DEITY_LOADING", payload: true });
    expect(next.deityLoading).toBe(true);
    next = deityReducer(next, { type: "SET_DEITY_ERROR", payload: "出错" });
    expect(next.deityError).toBe("出错");
    next = deityReducer(next, { type: "SET_DEITY_SUBMITTING_ID", payload: "hu" });
    expect(next.deitySubmittingId).toBe("hu");
  });

  // A4. SET_DIVINE_VIEW_SESSION 赋值 / INCREMENT 自增
  it("SET_DIVINE_VIEW_SESSION 赋值 / INCREMENT_DIVINE_VIEW_SESSION 自增", () => {
    let next = deityReducer(makeState(), { type: "SET_DIVINE_VIEW_SESSION", payload: 3 });
    expect(next.divineViewSession).toBe(3);
    next = deityReducer(next, { type: "INCREMENT_DIVINE_VIEW_SESSION" });
    expect(next.divineViewSession).toBe(4);
  });

  // A5. SET_DIVINE_REVEAL_REQUEST_ID 赋值
  it("SET_DIVINE_REVEAL_REQUEST_ID 赋值", () => {
    const next = deityReducer(makeState(), { type: "SET_DIVINE_REVEAL_REQUEST_ID", payload: 42 });
    expect(next.divineRevealRequestId).toBe(42);
  });
});

// ============================================================
// deityReducer — 边界条件
// ============================================================

describe("deityReducer 边界条件", () => {
  // B6. UPDATE_DEITY_STATUS 且 deityData 为 null → 原样返回（引用不变，不崩）
  it("UPDATE_DEITY_STATUS 且 deityData 为 null → 返回原 state", () => {
    const state = makeState();
    const next = deityReducer(state, {
      type: "UPDATE_DEITY_STATUS",
      payload: { deity: makeDeityStatus() }
    });
    expect(next).toBe(state);
  });

  // B7. UPDATE_DEITY_STATUS 无匹配 deityId → deities 内容不变
  it("UPDATE_DEITY_STATUS 无匹配 deityId → deities 内容不变", () => {
    const state = makeState({ deityData: makeDeityData() });
    const next = deityReducer(state, {
      type: "UPDATE_DEITY_STATUS",
      payload: { deity: makeDeityStatus({ deityId: "mx", totalWorships: 9 }) }
    });
    expect(next.deityData!.deities).toEqual(state.deityData!.deities);
  });

  // B8. INCREMENT_DIVINE_VIEW_SESSION 连续自增 0→1→2
  it("INCREMENT_DIVINE_VIEW_SESSION 连续自增 0→1→2", () => {
    let next = deityReducer(makeState(), { type: "INCREMENT_DIVINE_VIEW_SESSION" });
    expect(next.divineViewSession).toBe(1);
    next = deityReducer(next, { type: "INCREMENT_DIVINE_VIEW_SESSION" });
    expect(next.divineViewSession).toBe(2);
  });

  // B9. 未知 action type → default 分支原样返回
  it("未知 action type → 返回原 state", () => {
    const state = makeState({ divineViewSession: 5 });
    const next = deityReducer(state, { type: "UNKNOWN" } as unknown as DeityAction);
    expect(next).toBe(state);
  });

  // B10. CLEAR → 结果等于 createInitialState()
  it("CLEAR 重置回 createInitialState()", () => {
    const state = makeState({
      deityData: makeDeityData(),
      deityError: "x",
      deityLoading: true,
      deitySubmittingId: "hu",
      divineViewSession: 3,
      divineRevealRequestId: 9
    });
    const next = deityReducer(state, { type: "CLEAR" });
    expect(next).toEqual(createInitialState());
  });
});

// ============================================================
// Provider 数据加载 ①
// ============================================================

describe("Provider 数据加载 ①", () => {
  // E17. 非 auth/avatar 角色 + 有 token → mount 时加载写入 deityData
  it("非 auth/avatar 角色 + 有 token → mount 时加载写入 deityData", async () => {
    mockDesktop("panel");
    apiMock.getTodayDeityWorship.mockResolvedValue(makeDeityData({ worshipDay: "2026-08-13" }));
    const { result } = await renderDeity();
    expect(apiMock.getTodayDeityWorship).toHaveBeenCalledWith("t1");
    expect(result.current.deityData?.worshipDay).toBe("2026-08-13");
    expect(result.current.deityLoading).toBe(false);
    expect(result.current.deityError).toBeNull();
  });

  // E18. 无 token → 不加载，deityData 保持 null
  it("无 token → 不加载，deityData 保持 null", async () => {
    mockAuth(null, null);
    mockDesktop("panel");
    const { result } = await renderDeity();
    expect(apiMock.getTodayDeityWorship).not.toHaveBeenCalled();
    expect(result.current.deityData).toBeNull();
  });

  // E19. 加载失败 → deityError 记录错误 + deityLoading 复位 false
  it("加载失败 → deityError 记录错误 + loading 复位", async () => {
    mockDesktop("panel");
    apiMock.getTodayDeityWorship.mockRejectedValue(new Error("网络错误"));
    const { result } = await renderDeity();
    expect(result.current.deityError).toBe("网络错误");
    expect(result.current.deityLoading).toBe(false);
  });
});

// ============================================================
// worship handler
// ============================================================

describe("worship handler", () => {
  // D12. 无 token → 返回 null 且不调用 submitDeityWorship
  it("无 token → 返回 null 且不调用 submitDeityWorship", async () => {
    mockAuth(null, null);
    const { result } = await renderDeity();
    const res = await act(async () => result.current.worship("hu"));
    expect(res).toBeNull();
    expect(apiMock.submitDeityWorship).not.toHaveBeenCalled();
  });

  // D13. deitySubmittingId 非空（防重复提交）→ 返回 null 不重复请求
  it("deitySubmittingId 非空 → 返回 null 不重复请求", async () => {
    // submit 永不 resolve，制造"提交中"状态（dispatch 在 await 前同步执行）
    apiMock.submitDeityWorship.mockReturnValue(new Promise<DeityWorshipResponse>(() => {}));
    const { result } = await renderDeity();
    act(() => {
      void result.current.worship("hu");
    });
    expect(result.current.deitySubmittingId).toBe("hu");
    const second = await act(async () => result.current.worship("chui"));
    expect(second).toBeNull();
    expect(apiMock.submitDeityWorship).toHaveBeenCalledTimes(1);
  });

  // D14. 成功 → SET_DEITY_DATA(result) + 推回 Electron + 返回 result
  it("worship 成功 → 更新 deityData + 推回 Electron + 返回 result", async () => {
    mockDesktop("single");
    desktopBridgeMock.assignToWindow();
    const response = makeWorshipResponse();
    apiMock.submitDeityWorship.mockResolvedValue(response);
    const { result } = await renderDeity();
    const res = await act(async () => result.current.worship("hu"));
    expect(res).toEqual(response);
    expect(result.current.deityData).toEqual(response);
    expect(desktopBridgeMock.bridge.updateDivineSelectionData).toHaveBeenCalledWith(response);
  });

  // D15. submit 抛 ApiError 409 → 静默重拉 + 清 error + 返回 null
  it("worship 抛 ApiError 409 → 静默重拉 + 清 error + 返回 null", async () => {
    mockDesktop("single");
    apiMock.submitDeityWorship.mockRejectedValue(new apiMock.MockApiError(409, "今日已膜拜"));
    apiMock.getTodayDeityWorship.mockResolvedValue(makeDeityData({ worshipDay: "2026-08-13" }));
    const { result } = await renderDeity();
    const res = await act(async () => result.current.worship("hu"));
    expect(res).toBeNull();
    expect(apiMock.getTodayDeityWorship).toHaveBeenCalled(); // 静默重拉
    expect(result.current.deityError).toBeNull();
  });

  // D16. submit 抛其他错误 → SET_DEITY_ERROR + 返回 null
  it("worship 抛其他错误 → SET_DEITY_ERROR + 返回 null", async () => {
    mockDesktop("single");
    apiMock.submitDeityWorship.mockRejectedValue(new Error("服务器炸了"));
    const { result } = await renderDeity();
    const res = await act(async () => result.current.worship("hu"));
    expect(res).toBeNull();
    expect(result.current.deityError).toBe("服务器炸了");
    expect(result.current.deitySubmittingId).toBeNull();
  });
});

// ============================================================
// Socket ⑤ + 轮询 ⑥
// ============================================================

describe("Socket ⑤ + 轮询 ⑥", () => {
  // F20. deity:worship 事件 → 替换 deities 中目标 deity，其余不变
  it("deity:worship 事件 → 替换 deities 中目标 deity", async () => {
    mockDesktop("single");
    const { result } = await renderDeity();
    const shared = socketMock.getShared();
    expect(shared).not.toBeNull();
    await act(async () => {
      shared!._trigger("deity:worship", {
        deity: makeDeityStatus({ deityId: "hu", totalWorships: 9, rank: "true_god", nextThreshold: 10 })
      });
    });
    const hu = result.current.deityData?.deities.find((d) => d.deityId === "hu");
    expect(hu?.totalWorships).toBe(9);
    expect(hu?.rank).toBe("true_god");
    const chui = result.current.deityData?.deities.find((d) => d.deityId === "chui");
    expect(chui?.totalWorships).toBe(1);
  });

  // F21. activeTab === "divine" → 挂 60s 轮询静默重拉
  it("activeTab 为 divine → 60s 轮询静默重拉", async () => {
    vi.useFakeTimers();
    mockDesktop("single", "divine");
    await renderDeity();
    const callsBefore = apiMock.getTodayDeityWorship.mock.calls.length;
    expect(callsBefore).toBeGreaterThanOrEqual(1);
    // advance 后 flush 微任务，让 interval 触发的 async 重拉 dispatch 落在 act 内
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(apiMock.getTodayDeityWorship.mock.calls.length).toBe(callsBefore + 1);
  });

  // F22. auth/avatar 角色 → 不创建 socket（不挂 deity:worship 监听）
  it("auth/avatar 角色 → 不创建 socket 监听", async () => {
    mockAuth("t1", "u1", makeUser("u1"));
    mockDesktop("auth");
    await renderDeity();
    expect(socketMock.getShared()).toBeNull();
  });
});

// ============================================================
// divine IPC（② ③ ⑦）
// ============================================================

describe("divine IPC（② ③ ⑦）", () => {
  // G23. ② onDivineData 新 requestId → 更新数据 + viewSession+1 + revealRequestId 更新
  it("onDivineData 新 requestId → 更新数据 + viewSession+1 + revealRequestId 更新", async () => {
    mockDesktop("divine");
    desktopBridgeMock.assignToWindow();
    const { result } = await renderDeity();
    await act(async () => {
      desktopBridgeMock.listeners.onDivineData?.({ requestId: 5, data: makeDeityData({ worshipDay: "2026-08-13" }) });
    });
    expect(result.current.deityData?.worshipDay).toBe("2026-08-13");
    expect(result.current.divineViewSession).toBe(1);
    expect(result.current.divineRevealRequestId).toBe(5);
    expect(result.current.deityLoading).toBe(false);
    expect(result.current.deitySubmittingId).toBeNull();
    // flush ④ notifyDivineReady 的两帧 RAF，避免残留 timer
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    });
    expect(desktopBridgeMock.bridge.notifyDivineReady).toHaveBeenCalledWith(5);
  });

  // G24. ② onDivineData requestId 重复 或 <= 0 → 忽略，无状态变化
  it("onDivineData requestId 重复或 <= 0 → 忽略，无状态变化", async () => {
    mockDesktop("divine");
    desktopBridgeMock.assignToWindow();
    const { result } = await renderDeity();
    // 先应用一个有效 requestId
    await act(async () => {
      desktopBridgeMock.listeners.onDivineData?.({ requestId: 5, data: makeDeityData({ worshipDay: "2026-08-13" }) });
    });
    expect(result.current.divineViewSession).toBe(1);
    // 重复 requestId → 忽略
    await act(async () => {
      desktopBridgeMock.listeners.onDivineData?.({ requestId: 5, data: makeDeityData({ worshipDay: "2026-08-14" }) });
    });
    expect(result.current.divineViewSession).toBe(1);
    expect(result.current.deityData?.worshipDay).toBe("2026-08-13");
    // requestId <= 0 → 忽略
    await act(async () => {
      desktopBridgeMock.listeners.onDivineData?.({ requestId: 0, data: makeDeityData({ worshipDay: "2026-08-15" }) });
    });
    expect(result.current.divineViewSession).toBe(1);
    expect(result.current.deityData?.worshipDay).toBe("2026-08-13");
  });

  // G25. ③ divine 角色 + deityData 变化 → updateDivineSelectionData 推回（含 ① 加载后的初始推回）
  it("deityData 变化 → updateDivineSelectionData 推回", async () => {
    mockDesktop("divine");
    desktopBridgeMock.assignToWindow();
    apiMock.getTodayDeityWorship.mockResolvedValue(makeDeityData({ worshipDay: "2026-08-13" }));
    const { result } = await renderDeity();
    // ① 加载成功 → ③ 立即推回初始数据（等价的"mount 初始推回"行为）
    expect(desktopBridgeMock.bridge.updateDivineSelectionData).toHaveBeenCalledWith(
      makeDeityData({ worshipDay: "2026-08-13" })
    );
    const pushed = makeDeityData({ worshipDay: "2026-08-14" });
    await act(async () => {
      desktopBridgeMock.listeners.onDivineData?.({ requestId: 9, data: pushed });
    });
    expect(desktopBridgeMock.bridge.updateDivineSelectionData).toHaveBeenLastCalledWith(pushed);
  });

  // G26. ⑦ onDivineReturn（isDesktop）→ 先临时写入返回数据，随后静默重拉以服务器最新数据覆盖
  it("onDivineReturn（isDesktop）→ 临时更新 deityData + 静默重拉覆盖", async () => {
    mockDesktop("single");
    desktopBridgeMock.assignToWindow();
    desktopBridgeMock.bridge.isDesktop = true;
    apiMock.getTodayDeityWorship.mockResolvedValue(makeDeityData({ worshipDay: "2026-08-13" }));
    const { result } = await renderDeity();
    expect(result.current.deityData?.worshipDay).toBe("2026-08-13");
    const callsBefore = apiMock.getTodayDeityWorship.mock.calls.length;

    // 静默重拉先挂起（pending），让 onDivineReturn 的临时写入先可见
    let resolveReload: (v: DeityWorshipTodayResponse) => void = () => {};
    apiMock.getTodayDeityWorship.mockImplementation(
      () => new Promise<DeityWorshipTodayResponse>((resolve) => { resolveReload = resolve; })
    );
    await act(async () => {
      desktopBridgeMock.listeners.onDivineReturn?.({ data: makeDeityData({ worshipDay: "2026-08-15" }) });
    });
    // ① onDivineReturn 先临时写入返回的数据
    expect(result.current.deityData?.worshipDay).toBe("2026-08-15");
    // ② 随后静默重拉完成 → 服务器最新数据覆盖
    await act(async () => {
      resolveReload(makeDeityData({ worshipDay: "2026-08-16" }));
    });
    expect(result.current.deityData?.worshipDay).toBe("2026-08-16");
    expect(apiMock.getTodayDeityWorship.mock.calls.length).toBe(callsBefore + 1); // 静默重拉
  });
});

// ============================================================
// Provider 状态转换
// ============================================================

describe("Provider 状态转换", () => {
  // H27. ⑧ 登出（token → null）→ CLEAR，状态回初始
  it("登出（token → null）→ CLEAR，状态回初始", async () => {
    mockDesktop("single");
    mockAuth("t1", "u1", makeUser("u1"));
    apiMock.getTodayDeityWorship.mockResolvedValue(makeDeityData({ worshipDay: "2026-08-13" }));
    const { result, rerender } = await renderDeity();
    expect(result.current.deityData?.worshipDay).toBe("2026-08-13");
    // 登出：useAuth 返回无 token
    mockAuth(null, null);
    await act(async () => {
      rerender();
    });
    expect(result.current.deityData).toBeNull();
    expect(result.current.divineViewSession).toBe(0);
  });

  // H28. useDeity 在 Provider 外调用 → 抛错
  it("useDeity 在 Provider 外调用 → 抛错", () => {
    expect(() => renderHook(() => useDeity())).toThrow("useDeity must be used within DeityProvider");
  });
});
