// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../test-setup";
import { act, renderHook } from "@testing-library/react";
import type { GomokuGame, UserProfile } from "@xiaoelong/shared";
import {
  createInitialState,
  gomokuReducer,
  GomokuProvider,
  useGomoku,
  type GomokuAction,
  type GomokuState
} from "./GomokuContext";
import { useAuth, type AuthContextValue } from "./AuthContext";
import { useDesktop, type DesktopContextValue } from "./DesktopContext";

// ============================================================
// Mock 依赖：socket.ts / api.ts / pet-animation.ts / AuthContext / DesktopContext
// ============================================================

/**
 * 可控假 socket（与 Chat/Deity 测试同款）：
 * - on/off 记录监听器，可手动 _trigger 事件（模拟服务器下发）
 * - emit 记录调用 + 保存最后一个 ack 回调，由测试手动触发
 */
const socketMock = vi.hoisted(() => {
  const emitCalls: { event: string; payload: unknown }[] = [];
  let lastAck: ((ack: { ok: boolean; error?: string; game?: GomokuGame }) => void) | null = null;
  let sharedSocket: {
    connected: boolean;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    off: (event: string, handler: (...args: unknown[]) => void) => void;
    emit: (event: string, payload: unknown, ack?: (a: { ok: boolean; error?: string; game?: GomokuGame }) => void) => void;
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
      emit(event, payload, ack) {
        emitCalls.push({ event, payload });
        if (ack) lastAck = ack;
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
    emitCalls,
    /** 手动触发最近一次 emit 的 ack 回调 */
    getLastAck: () => lastAck,
    /** 返回当前假 socket（effect 建的那个），未建则 null */
    getShared: () => sharedSocket,
    /** 覆盖当前假 socket（测"连接未建立"场景） */
    setShared: (s: typeof sharedSocket) => {
      sharedSocket = s;
    },
    /** 清空 emit 记录和 ack（每次测试前调用） */
    reset: () => {
      emitCalls.length = 0;
      lastAck = null;
      sharedSocket = null;
    }
  };
});

vi.mock("../services/socket", () => ({
  getOrCreateSocket: () => socketMock.createFakeSocket(),
  getSharedSocket: () => socketMock.getShared()
}));

/** 可控 api mock：对局列表加载 */
const apiMock = vi.hoisted(() => ({
  getGomokuGames: vi.fn()
}));

vi.mock("../services/api", () => ({
  getGomokuGames: apiMock.getGomokuGames
}));

/** getPetReaction mock：gomoku:end 时桌宠反应，返回固定对象供 setPetReaction 断言 */
const petReactionMock = vi.hoisted(() => ({
  getPetReaction: vi.fn(() => ({ gameId: 0, kind: "victory" }))
}));

vi.mock("../utils/pet-animation", () => ({
  getPetReaction: petReactionMock.getPetReaction
}));

vi.mock("./AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("./DesktopContext", () => ({ useDesktop: vi.fn() }));

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseDesktop = vi.mocked(useDesktop);

/**
 * GomokuContext 从 useAuth 解构 token / currentUserId，从 useDesktop 解构 desktopRole / setPetReaction，
 * 这里只 mock 这些字段（缺失字段用类型断言占位）。
 */
function mockAuth(token: string | null, currentUserId: string | null): void {
  mockedUseAuth.mockReturnValue({ token, currentUserId } as unknown as AuthContextValue);
}

const setPetReactionMock = vi.fn();
function mockDesktop(desktopRole: string): void {
  mockedUseDesktop.mockReturnValue({
    desktopRole,
    setPetReaction: setPetReactionMock
  } as unknown as DesktopContextValue);
}

// ============================================================
// 辅助函数
// ============================================================

function makeState(overrides?: Partial<GomokuState>): GomokuState {
  return { ...createInitialState(), ...overrides };
}

function makeUser(id = "u1", nickname = "用户"): UserProfile {
  return { id, nickname, avatarUrl: null, createdAt: "2026-01-01" };
}

function makeGame(overrides?: Partial<GomokuGame>): GomokuGame {
  return {
    id: 1,
    status: "playing",
    playerBlack: makeUser("u1", "黑方"),
    playerWhite: makeUser("u2", "白方"),
    currentTurn: "u1",
    winner: null,
    boardState: Array.from({ length: 15 }, () => Array(15).fill(0)),
    invitedBy: "u1",
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    ...overrides
  };
}

/**
 * 挂载 GomokuProvider 并 flush 加载 effect 的 async dispatch。
 * 加载是 `await getGomokuGames` 后再 dispatch，发生在挂载后的微任务里；
 * 不 flush 的话 React 会报 act(...) warning。
 */
async function renderGomoku() {
  const utils = renderHook(() => useGomoku(), { wrapper: GomokuProvider });
  await act(async () => {});
  return utils;
}

// ============================================================
// 全局 mock 默认值
// ============================================================

beforeEach(() => {
  socketMock.reset();
  mockedUseAuth.mockReset();
  mockedUseDesktop.mockReset();
  setPetReactionMock.mockReset();
  petReactionMock.getPetReaction.mockClear();
  apiMock.getGomokuGames.mockReset();

  // 默认登录态：有 token + 有用户；角色 single（全功能）；列表正常返回空
  mockAuth("t1", "u1");
  mockDesktop("single");
  apiMock.getGomokuGames.mockResolvedValue({ games: [] });
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
  // B13. 四字段全部为初始值
  it("四字段全部为初始值", () => {
    const state = createInitialState();
    expect(state.games).toEqual([]);
    expect(state.selectedGameId).toBeNull();
    expect(state.error).toBeNull();
    expect(state.loading).toBe(false);
  });
});

// ============================================================
// gomokuReducer — 正常路径
// ============================================================

describe("gomokuReducer 正常路径", () => {
  // A1. SET_GAMES 全量替换 games
  it("SET_GAMES 全量替换 games", () => {
    const state = makeState({ games: [makeGame()] });
    const next = gomokuReducer(state, { type: "SET_GAMES", payload: [makeGame({ id: 9 })] });
    expect(next.games.map((g) => g.id)).toEqual([9]);
  });

  // A2. SET_GAMES 当前选中仍在列表 → 选中保留
  it("SET_GAMES 当前选中仍在列表 → 选中保留", () => {
    const state = makeState({ games: [makeGame({ id: 1 }), makeGame({ id: 2 })], selectedGameId: 2 });
    const next = gomokuReducer(state, { type: "SET_GAMES", payload: [makeGame({ id: 2 }), makeGame({ id: 3 })] });
    expect(next.selectedGameId).toBe(2);
  });

  // A3. UPSERT_GAME 插入新对局（不存在 id）→ 插入 + 按 updatedAt 新→旧重排
  it("UPSERT_GAME 插入新对局 + 按 updatedAt 重排", () => {
    const old = makeGame({ id: 1, updatedAt: "2026-08-11T00:00:01.000Z" });
    const newest = makeGame({ id: 2, updatedAt: "2026-08-11T00:00:03.000Z" });
    const state = makeState({ games: [old, newest] });
    const next = gomokuReducer(state, { type: "UPSERT_GAME", payload: makeGame({ id: 3, updatedAt: "2026-08-11T00:00:02.000Z" }) });
    expect(next.games.map((g) => g.id)).toEqual([2, 3, 1]);
  });

  // A4. UPSERT_GAME 更新已存在对局 → 替换 + 重排
  it("UPSERT_GAME 更新已存在对局 → 替换 + 重排", () => {
    const old = makeGame({ id: 1, updatedAt: "2026-08-11T00:00:01.000Z" });
    const state = makeState({ games: [old, makeGame({ id: 2, updatedAt: "2026-08-11T00:00:02.000Z" })] });
    const updated = makeGame({ id: 1, updatedAt: "2026-08-11T00:00:03.000Z", status: "finished", winner: "u1" });
    const next = gomokuReducer(state, { type: "UPSERT_GAME", payload: updated });
    expect(next.games.map((g) => g.id)).toEqual([1, 2]);
    expect(next.games[0].status).toBe("finished");
  });

  // A5. UPSERT_GAME 无变化（areGamesEqual 判定相等）→ 返回原数组引用
  it("UPSERT_GAME 数据无变化 → 返回原数组引用", () => {
    const game = makeGame();
    let state = makeState();
    state = gomokuReducer(state, { type: "UPSERT_GAME", payload: game });
    const gamesRef = state.games;
    const next = gomokuReducer(state, { type: "UPSERT_GAME", payload: game });
    expect(next.games).toBe(gamesRef);
  });

  // A6. APPLY_USER_UPDATE 匹配对局内黑/白玩家 → 对应资料替换，另一侧不动
  it("APPLY_USER_UPDATE 更新对局内黑/白玩家资料", () => {
    const state = makeState({ games: [makeGame()] });
    const next = gomokuReducer(state, { type: "APPLY_USER_UPDATE", payload: makeUser("u1", "黑方新名") });
    expect(next.games[0].playerBlack.nickname).toBe("黑方新名");
    expect(next.games[0].playerWhite).toBe(state.games[0].playerWhite);
  });

  // A7. SET_SELECTED_GAME / SET_ERROR / SET_LOADING 各设置字段
  it("SET_SELECTED_GAME / SET_ERROR / SET_LOADING 设置字段", () => {
    let next = gomokuReducer(makeState(), { type: "SET_SELECTED_GAME", payload: 3 });
    expect(next.selectedGameId).toBe(3);
    next = gomokuReducer(next, { type: "SET_ERROR", payload: "出错" });
    expect(next.error).toBe("出错");
    next = gomokuReducer(next, { type: "SET_LOADING", payload: true });
    expect(next.loading).toBe(true);
  });

  // A8. CLEAR → 重置回 createInitialState()
  it("CLEAR 重置回 createInitialState()", () => {
    const state = makeState({ games: [makeGame()], selectedGameId: 1, error: "x", loading: true });
    const next = gomokuReducer(state, { type: "CLEAR" });
    expect(next).toEqual(createInitialState());
  });
});

// ============================================================
// gomokuReducer — 边界条件
// ============================================================

describe("gomokuReducer 边界条件", () => {
  // B9. SET_GAMES 空数组 → 选中变 null
  it("SET_GAMES 空数组 → selectedGameId 变 null", () => {
    const state = makeState({ selectedGameId: 3 });
    const next = gomokuReducer(state, { type: "SET_GAMES", payload: [] });
    expect(next.games).toEqual([]);
    expect(next.selectedGameId).toBeNull();
  });

  // B10. SET_GAMES 当前选中被移除 → 退位到 games[0]
  it("SET_GAMES 当前选中被移除 → 退位到 games[0]", () => {
    const game = makeGame({ id: 1 });
    const state = makeState({ games: [game, makeGame({ id: 2 })], selectedGameId: 2 });
    const next = gomokuReducer(state, { type: "SET_GAMES", payload: [game] });
    expect(next.selectedGameId).toBe(1);
  });

  // B11. UPSERT_GAME 未选中（null）→ 自动选中该局
  it("UPSERT_GAME 未选中 → 自动选中新对局", () => {
    const state = makeState();
    const next = gomokuReducer(state, { type: "UPSERT_GAME", payload: makeGame({ id: 7 }) });
    expect(next.selectedGameId).toBe(7);
  });

  // B12. APPLY_USER_UPDATE 玩家不属于任何对局 → 数组原样（引用不变）
  it("APPLY_USER_UPDATE 玩家不属于任何对局 → 数组原样", () => {
    const state = makeState({ games: [makeGame()] });
    const next = gomokuReducer(state, { type: "APPLY_USER_UPDATE", payload: makeUser("u99", "路人") });
    expect(next.games).toBe(state.games);
  });
});

// ============================================================
// Provider 数据加载
// ============================================================

describe("Provider 数据加载", () => {
  // 非 auth/avatar 角色 + token → mount 时加载 games
  it("非 auth/avatar 角色 + token → mount 时加载 games", async () => {
    mockDesktop("panel");
    const game = makeGame();
    apiMock.getGomokuGames.mockResolvedValue({ games: [game] });
    const { result } = await renderGomoku();
    expect(apiMock.getGomokuGames).toHaveBeenCalledWith("t1");
    expect(result.current.games).toEqual([game]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  // 无 token → 不加载，games 保持空
  it("无 token → 不加载", async () => {
    mockAuth(null, null);
    mockDesktop("panel");
    const { result } = await renderGomoku();
    expect(apiMock.getGomokuGames).not.toHaveBeenCalled();
    expect(result.current.games).toEqual([]);
  });

  // 加载失败 → SET_ERROR + loading 复位 false
  it("加载失败 → SET_ERROR + loading 复位", async () => {
    mockDesktop("panel");
    apiMock.getGomokuGames.mockRejectedValue(new Error("网络错误"));
    const { result } = await renderGomoku();
    expect(result.current.error).toBe("网络错误");
    expect(result.current.loading).toBe(false);
  });
});

// ============================================================
// handler 错误路径（socket 缺失 / ack 失败 / 超时）
// ============================================================

describe("handler 错误路径", () => {
  // C14. invite / accept / reject 无连接 → SET_ERROR("连接未建立") + 不 emit
  it("invite/accept/reject 无连接 → SET_ERROR + 不 emit", async () => {
    mockDesktop("panel");
    const { result } = await renderGomoku();
    socketMock.setShared(null);
    await act(async () => { await result.current.invite("u2"); });
    expect(result.current.error).toBe("连接未建立，无法发起邀请。");
    await act(async () => { await result.current.accept(1); });
    expect(result.current.error).toBe("连接未建立，无法接受邀请。");
    await act(async () => { await result.current.reject(1); });
    expect(result.current.error).toBe("连接未建立，无法拒绝邀请。");
    expect(socketMock.emitCalls).toHaveLength(0);
  });

  // C15. move 无连接 → 返回 false + SET_ERROR
  it("move 无连接 → 返回 false + SET_ERROR", async () => {
    mockDesktop("panel");
    const { result } = await renderGomoku();
    socketMock.setShared(null);
    const res = await act(async () => result.current.move(1, 0, 0));
    expect(res).toBe(false);
    expect(result.current.error).toBe("连接未建立，无法落子。");
  });

  // C16. emitWithAck 超时（8s）→ SET_ERROR + move 返回 false
  it("emitWithAck 超时（8s）→ SET_ERROR + move 返回 false", async () => {
    vi.useFakeTimers();
    mockDesktop("panel");
    const { result } = await renderGomoku();
    await act(async () => {
      const p = result.current.move(1, 0, 0);
      vi.advanceTimersByTime(8000);
      expect(await p).toBe(false);
    });
    expect(result.current.error).toBe("gomoku:move timeout.");
  });

  // C17. ack 返回 ok:false → SET_ERROR + 不 UPSERT
  it("ack 返回 ok:false → SET_ERROR + 不 UPSERT", async () => {
    mockDesktop("panel");
    const { result } = await renderGomoku();
    await act(async () => {
      const p = result.current.invite("u2");
      socketMock.getLastAck()!({ ok: false, error: "对方不在线" });
      await p;
    });
    expect(result.current.error).toBe("对方不在线");
    expect(result.current.games).toEqual([]);
  });
});

// ============================================================
// handler 成功路径
// ============================================================

describe("handler 成功路径", () => {
  // C18a. invite 成功 → emit gomoku:invite + UPSERT + 选中新局
  it("invite 成功 → UPSERT + 选中新局", async () => {
    mockDesktop("panel");
    const { result } = await renderGomoku();
    const newGame = makeGame({ id: 2, status: "invited" });
    await act(async () => {
      const p = result.current.invite("u2");
      socketMock.getLastAck()!({ ok: true, game: newGame });
      await p;
    });
    expect(socketMock.emitCalls[0].event).toBe("gomoku:invite");
    expect(socketMock.emitCalls[0].payload).toEqual({ targetUserId: "u2" });
    expect(result.current.games).toContainEqual(newGame);
    expect(result.current.selectedGameId).toBe(2);
  });

  // C18b. accept 成功 → emit gomoku:accept + UPSERT + 选中
  it("accept 成功 → UPSERT + 选中", async () => {
    mockDesktop("panel");
    const { result } = await renderGomoku();
    const playing = makeGame({ id: 1, status: "playing" });
    await act(async () => {
      const p = result.current.accept(1);
      socketMock.getLastAck()!({ ok: true, game: playing });
      await p;
    });
    expect(socketMock.emitCalls[0].event).toBe("gomoku:accept");
    expect(socketMock.emitCalls[0].payload).toEqual({ gameId: 1 });
    expect(result.current.games).toContainEqual(playing);
    expect(result.current.selectedGameId).toBe(1);
  });

  // C18c. reject 成功 → emit gomoku:reject + UPSERT
  it("reject 成功 → UPSERT", async () => {
    mockDesktop("panel");
    const { result } = await renderGomoku();
    const declined = makeGame({ id: 1, status: "declined" });
    await act(async () => {
      const p = result.current.reject(1);
      socketMock.getLastAck()!({ ok: true, game: declined });
      await p;
    });
    expect(socketMock.emitCalls[0].event).toBe("gomoku:reject");
    expect(socketMock.emitCalls[0].payload).toEqual({ gameId: 1 });
    expect(result.current.games).toContainEqual(declined);
  });

  // C18d. move 成功 → emit gomoku:move（含 row/col）+ UPSERT + 返回 true
  it("move 成功 → UPSERT + 返回 true", async () => {
    mockDesktop("panel");
    const { result } = await renderGomoku();
    const afterMove = makeGame({ id: 1 });
    await act(async () => {
      const p = result.current.move(1, 3, 4);
      socketMock.getLastAck()!({ ok: true, game: afterMove });
      expect(await p).toBe(true);
    });
    expect(socketMock.emitCalls[0].event).toBe("gomoku:move");
    expect(socketMock.emitCalls[0].payload).toEqual({ gameId: 1, row: 3, col: 4 });
    expect(result.current.games).toContainEqual(afterMove);
  });

  // C19. move 失败（ack !ok）→ SET_ERROR + 锁释放，可再次 move
  it("move 失败后锁释放 → 可再次 move", async () => {
    mockDesktop("panel");
    const { result } = await renderGomoku();
    await act(async () => {
      const p = result.current.move(1, 0, 0);
      socketMock.getLastAck()!({ ok: false, error: "不是你的回合" });
      await p;
    });
    expect(result.current.error).toBe("不是你的回合");
    await act(async () => {
      const p = result.current.move(1, 0, 1);
      socketMock.getLastAck()!({ ok: true, game: makeGame() });
      await p;
    });
    expect(socketMock.emitCalls.filter((c) => c.event === "gomoku:move")).toHaveLength(2);
  });
});

// ============================================================
// Provider 状态转换 + Socket 分流
// ============================================================

describe("Provider 状态转换 + Socket 分流", () => {
  // D20. move 防重：同局 pending 中再次 move → 返回 false 且不二次 emit
  it("move 防重：pending 中再次 move → false 且不二次 emit", async () => {
    mockDesktop("panel");
    const { result } = await renderGomoku();
    let p2: Promise<boolean>;
    act(() => {
      void result.current.move(1, 0, 0); // 挂起，不触发 ack
      p2 = result.current.move(1, 0, 1);
    });
    expect(await p2!).toBe(false);
    expect(socketMock.emitCalls.filter((c) => c.event === "gomoku:move")).toHaveLength(1);
  });

  // D21. 登出（token → null）→ CLEAR，状态回初始
  it("登出（token→null）→ CLEAR，状态回初始", async () => {
    mockDesktop("panel");
    const game = makeGame();
    apiMock.getGomokuGames.mockResolvedValue({ games: [game] });
    const { result, rerender } = await renderGomoku();
    expect(result.current.games).toHaveLength(1);
    mockAuth(null, null);
    await act(async () => { rerender(); });
    expect(result.current.games).toEqual([]);
    expect(result.current.selectedGameId).toBeNull();
  });

  // D22. useGomoku 在 Provider 外调用 → 抛错
  it("useGomoku 在 Provider 外调用 → 抛错", () => {
    expect(() => renderHook(() => useGomoku())).toThrow("useGomoku must be used within GomokuProvider");
  });

  // D23a. auth 角色 → 不加载、不创建 socket
  it("auth 角色 → 不加载、不创建 socket", async () => {
    mockDesktop("auth");
    const { result } = await renderGomoku();
    expect(apiMock.getGomokuGames).not.toHaveBeenCalled();
    expect(socketMock.getShared()).toBeNull();
    expect(result.current.games).toEqual([]);
  });

  // D23b. avatar 角色 → 不加载、不监听 gomoku:update，但监听 gomoku:end（桌宠反应）
  it("avatar 角色 → 不加载、不监听 gomoku:update，但监听 gomoku:end", async () => {
    mockDesktop("avatar");
    const { result } = await renderGomoku();
    expect(apiMock.getGomokuGames).not.toHaveBeenCalled();
    // gomoku:update 未被监听 → games 不更新
    await act(async () => {
      socketMock.getShared()!._trigger("gomoku:update", { game: makeGame({ id: 2 }) });
    });
    expect(result.current.games).toEqual([]);
    // gomoku:end 被监听 → setPetReaction 被调用，但列表不更新
    await act(async () => {
      socketMock.getShared()!._trigger("gomoku:end", { game: makeGame({ id: 2 }), winner: "u1" });
    });
    expect(setPetReactionMock).toHaveBeenCalled();
    expect(result.current.games).toEqual([]);
  });

  // D24a. gomoku:end（single 角色）→ 更新列表 + setPetReaction
  it("gomoku:end（single 角色）→ 更新列表 + setPetReaction", async () => {
    mockDesktop("single");
    const { result } = await renderGomoku();
    const endGame = makeGame({ id: 3, status: "finished", winner: "u1" });
    await act(async () => {
      socketMock.getShared()!._trigger("gomoku:end", { game: endGame, winner: "u1" });
    });
    expect(result.current.games).toContainEqual(endGame);
    expect(petReactionMock.getPetReaction).toHaveBeenCalledWith(3, "u1", "u1");
    expect(setPetReactionMock).toHaveBeenCalled();
  });

  // D24b. gomoku:end（panel 角色）→ 更新列表但不调 setPetReaction
  it("gomoku:end（panel 角色）→ 更新列表但不调 setPetReaction", async () => {
    mockDesktop("panel");
    const { result } = await renderGomoku();
    const endGame = makeGame({ id: 3, status: "finished", winner: "u1" });
    await act(async () => {
      socketMock.getShared()!._trigger("gomoku:end", { game: endGame, winner: "u1" });
    });
    expect(result.current.games).toContainEqual(endGame);
    expect(setPetReactionMock).not.toHaveBeenCalled();
  });

  // D25. gomoku:update 广播 → UPSERT + 未选中时自动选中
  it("gomoku:update 广播 → UPSERT + 自动选中新局", async () => {
    mockDesktop("panel");
    const { result } = await renderGomoku();
    const update = makeGame({ id: 5 });
    await act(async () => {
      socketMock.getShared()!._trigger("gomoku:update", { game: update });
    });
    expect(result.current.games).toContainEqual(update);
    expect(result.current.selectedGameId).toBe(5);
  });

  // D26. user:update 广播 → 对局内玩家资料同步
  it("user:update 广播 → 对局内玩家资料同步", async () => {
    mockDesktop("panel");
    const game = makeGame();
    apiMock.getGomokuGames.mockResolvedValue({ games: [game] });
    const { result } = await renderGomoku();
    expect(result.current.games).toHaveLength(1);
    await act(async () => {
      socketMock.getShared()!._trigger("user:update", { user: makeUser("u1", "改名后") });
    });
    expect(result.current.games[0].playerBlack.nickname).toBe("改名后");
  });
});
