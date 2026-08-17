// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../test-setup";
import { act, render, renderHook, screen } from "@testing-library/react";
import type { ChatFile, ChatImage, ChatMessage, DailyMood, PresenceUser, UserProfile } from "@xiaoelong/shared";
import {
  chatReducer,
  createInitialState,
  ChatProvider,
  useChat,
  type ChatAction,
  type ChatScrollMemory,
  type ChatState
} from "./ChatContext";
import { useAuth, type AuthContextValue } from "./AuthContext";
import { useDesktop, type DesktopContextValue } from "./DesktopContext";

// ============================================================
// Mock 依赖：socket.ts / api.ts / AuthContext / DesktopContext
// ============================================================

/**
 * 可控假 socket：
 * - on/off 记录监听器，可手动 _trigger 事件（模拟服务器下发）
 * - emit 记录调用 + 保存最后一个 ack 回调，由测试手动触发
 */
const socketMock = vi.hoisted(() => {
  const emitCalls: { event: string; payload: unknown }[] = [];
  let lastAck: ((ack: { ok: boolean; error?: string }) => void) | null = null;
  let sharedSocket: {
    connected: boolean;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    off: (event: string, handler: (...args: unknown[]) => void) => void;
    emit: (event: string, payload: unknown, ack?: (a: { ok: boolean; error?: string }) => void) => void;
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
    /** 返回当前假 socket（effect 建的那个） */
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

/** 可控 api mock：历史加载 / 图片上传 / 文件上传 */
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
    getRecentMessages: vi.fn(),
    uploadChatImage: vi.fn(),
    uploadChatFile: vi.fn()
  };
});

vi.mock("../services/api", () => ({
  getRecentMessages: apiMock.getRecentMessages,
  uploadChatImage: apiMock.uploadChatImage,
  uploadChatFile: apiMock.uploadChatFile,
  ApiError: apiMock.MockApiError
}));

vi.mock("./AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("./DesktopContext", () => ({ useDesktop: vi.fn() }));

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseDesktop = vi.mocked(useDesktop);
const invalidateSessionMock = vi.fn();

/**
 * ChatContext 从 Auth 读取当前用户并在历史 401 时条件失效对应会话；其余字段用类型断言占位。
 */
function mockAuth(token: string | null, currentUserId: string | null): void {
  mockedUseAuth.mockReturnValue({
    token,
    currentUserId,
    currentUser: currentUserId ? makeUser(currentUserId) : null,
    invalidateSession: invalidateSessionMock
  } as unknown as AuthContextValue);
}

function mockDesktop(desktopRole: string): void {
  mockedUseDesktop.mockReturnValue({ desktopRole } as unknown as DesktopContextValue);
}

// ============================================================
// 辅助函数
// ============================================================

function makeState(overrides?: Partial<ChatState>): ChatState {
  return { ...createInitialState(), ...overrides };
}

function makeUser(id = "u1", nickname = "用户"): UserProfile {
  return { id, nickname, avatarUrl: null, createdAt: "2026-01-01" };
}

function makeMessage(id: number, userId = "u1", content = "hello"): ChatMessage {
  return { id, user: makeUser(userId), content, image: null, file: null, replyTo: null, createdAt: "2026-08-11T00:00:00.000Z" };
}

function makePresenceUser(id = "u1", isOnline = true, nickname = "用户"): PresenceUser {
  return { ...makeUser(id, nickname), isOnline, todayMood: null };
}

function makeMood(userId: string): DailyMood {
  return { userId, moodDay: "2026-08-11", emoji: "😊", updatedAt: "2026-08-11T00:00:00.000Z" };
}

function makeImage(): ChatImage {
  return { url: "http://x/1.png", name: "a.png", mimeType: "image/png", size: 10 };
}

function makeFile(): ChatFile {
  return { url: "http://x/1.txt", name: "a.txt", mimeType: "text/plain", size: 10 };
}

/**
 * 等待 sendMessage 的异步流程推进到 emit（上传附件是 await 的，emit 在之后）。
 * 最多等 10 个微任务，然后手动触发最近一次 emit 的 ack。
 */
async function triggerLastAck(ack: { ok: boolean; error?: string }): Promise<void> {
  for (let i = 0; i < 10 && !socketMock.getLastAck(); i++) {
    await Promise.resolve();
  }
  socketMock.getLastAck()!(ack);
}

/**
 * 挂载 ChatProvider 并 flush 历史加载 effect 的 async dispatch。
 * 历史加载是 `await getRecentMessages` 后再 dispatch，发生在挂载后的微任务里；
 * 不 flush 的话 React 会报 act(...) warning。
 */
async function renderChat() {
  const utils = renderHook(() => useChat(), { wrapper: ChatProvider });
  await act(async () => {});
  return utils;
}

// ============================================================
// 全局 mock 默认值
// ============================================================

beforeEach(() => {
  socketMock.reset();
  invalidateSessionMock.mockReset();
  invalidateSessionMock.mockResolvedValue(undefined);
  mockedUseAuth.mockReset();
  mockedUseDesktop.mockReset();
  apiMock.getRecentMessages.mockReset();
  apiMock.uploadChatImage.mockReset();
  apiMock.uploadChatFile.mockReset();

  // 默认登录态：有 token + 有用户；角色为 single（全功能）；历史为空
  mockAuth("t1", "u1");
  mockDesktop("single");
  apiMock.getRecentMessages.mockResolvedValue({ messages: [] });
});

afterEach(() => {
  mockedUseAuth.mockReset();
  mockedUseDesktop.mockReset();
});

// ============================================================
// createInitialState 测试
// ============================================================

describe("createInitialState", () => {
  it("全部字段为初始值", () => {
    const state = createInitialState();
    expect(state.messages).toEqual([]);
    expect(state.presenceUsers).toEqual([]);
    expect(state.sendError).toBeNull();
    expect(state.socketError).toBeNull();
    expect(state.historyInitialized).toBe(false);
    expect(state.hasOlderMessages).toBe(true);
    expect(state.loadingOlderMessages).toBe(false);
    expect(state.olderMessagesError).toBeNull();
  });
});

// ============================================================
// chatReducer — 正常路径
// ============================================================

describe("chatReducer 正常路径", () => {
  it("SET_MESSAGES 合并历史与历史加载前先到达的实时消息", () => {
    const state = makeState({ messages: [makeMessage(1)] });
    const next = chatReducer(state, { type: "SET_MESSAGES", payload: [makeMessage(2)] });
    expect(next.messages).toEqual([makeMessage(1), makeMessage(2)]);
    expect(next.historyInitialized).toBe(true);
  });

  it("MERGE_MESSAGES 合并补漏并按 id 升序（中间遗漏消息补回）", () => {
    const state = makeState({ messages: [makeMessage(1), makeMessage(3)] });
    const next = chatReducer(state, { type: "MERGE_MESSAGES", payload: [makeMessage(2)] });
    expect(next.messages.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("MERGE_MESSAGES 去重：重复 id 不出现两次", () => {
    const state = makeState({ messages: [makeMessage(1), makeMessage(2)] });
    const next = chatReducer(state, { type: "MERGE_MESSAGES", payload: [makeMessage(2), makeMessage(3)] });
    expect(next.messages.map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("MERGE_MESSAGES 同 id 用服务器最新数据覆盖", () => {
    const state = makeState({ messages: [makeMessage(1, "u1", "旧内容")] });
    const next = chatReducer(state, { type: "MERGE_MESSAGES", payload: [makeMessage(1, "u1", "新内容")] });
    expect(next.messages).toEqual([makeMessage(1, "u1", "新内容")]);
  });

  it("ADD_MESSAGE 追加一条消息到末尾", () => {
    const state = makeState({ messages: [makeMessage(1)] });
    const next = chatReducer(state, { type: "ADD_MESSAGE", payload: makeMessage(2) });
    expect(next.messages).toEqual([makeMessage(1), makeMessage(2)]);
  });

  it("ADD_MESSAGE 重复 id 去重（同一条消息不出现两次）", () => {
    const state = makeState({ messages: [makeMessage(1)] });
    const next = chatReducer(state, { type: "ADD_MESSAGE", payload: makeMessage(1) });
    expect(next.messages).toEqual([makeMessage(1)]);
  });

  it("SET_PRESENCE_USERS 全量替换在线列表", () => {
    const state = makeState({ presenceUsers: [makePresenceUser("u1")] });
    const next = chatReducer(state, { type: "SET_PRESENCE_USERS", payload: [makePresenceUser("u2")] });
    expect(next.presenceUsers).toEqual([makePresenceUser("u2")]);
  });

  it("UPDATE_PRESENCE_ONLINE 新用户上线 → 添加进列表且 isOnline=true", () => {
    const state = makeState({ presenceUsers: [makePresenceUser("u1")] });
    const action: ChatAction = {
      type: "UPDATE_PRESENCE_ONLINE",
      payload: { userId: "u2", onlineUserIds: ["u1", "u2"], user: makePresenceUser("u2") }
    };
    const next = chatReducer(state, action);
    expect(next.presenceUsers).toHaveLength(2);
    const u2 = next.presenceUsers.find((u) => u.id === "u2");
    expect(u2?.isOnline).toBe(true);
  });

  it("UPDATE_PRESENCE_ONLINE 已在列表的用户再次上线 → 不重复添加，仅更新在线状态", () => {
    const state = makeState({ presenceUsers: [makePresenceUser("u1", false)] });
    const action: ChatAction = {
      type: "UPDATE_PRESENCE_ONLINE",
      payload: { userId: "u1", onlineUserIds: ["u1"], user: makePresenceUser("u1", true) }
    };
    const next = chatReducer(state, action);
    expect(next.presenceUsers).toHaveLength(1);
    expect(next.presenceUsers[0].isOnline).toBe(true);
  });

  it("UPDATE_PRESENCE_OFFLINE 批量更新在线状态（下线的 isOnline=false）", () => {
    const state = makeState({ presenceUsers: [makePresenceUser("u1", true), makePresenceUser("u2", true)] });
    const next = chatReducer(state, { type: "UPDATE_PRESENCE_OFFLINE", payload: ["u2"] });
    expect(next.presenceUsers.find((u) => u.id === "u1")?.isOnline).toBe(false);
    expect(next.presenceUsers.find((u) => u.id === "u2")?.isOnline).toBe(true);
  });

  it("UPDATE_MOOD_IN_PRESENCE 更新单用户心情，其他用户不受影响", () => {
    const mood = makeMood("u2");
    const state = makeState({ presenceUsers: [makePresenceUser("u1"), makePresenceUser("u2")] });
    const action: ChatAction = { type: "UPDATE_MOOD_IN_PRESENCE", payload: { userId: "u2", mood } };
    const next = chatReducer(state, action);
    expect(next.presenceUsers[0].todayMood).toBeNull();
    expect(next.presenceUsers[1].todayMood).toEqual(mood);
  });

  it("UPDATE_USER_IN_PRESENCE 匹配用户资料更新", () => {
    const state = makeState({ presenceUsers: [makePresenceUser("u1"), makePresenceUser("u2")] });
    const action: ChatAction = { type: "UPDATE_USER_IN_PRESENCE", payload: makeUser("u2", "新名") };
    const next = chatReducer(state, action);
    expect(next.presenceUsers[0].nickname).toBe("用户");
    expect(next.presenceUsers[1].nickname).toBe("新名");
  });

  it("UPDATE_USER_IN_MESSAGES 匹配消息中的用户资料更新", () => {
    const state = makeState({ messages: [makeMessage(1, "u1"), makeMessage(2, "u2")] });
    const action: ChatAction = { type: "UPDATE_USER_IN_MESSAGES", payload: makeUser("u2", "新名") };
    const next = chatReducer(state, action);
    expect(next.messages[0].user.nickname).toBe("用户");
    expect(next.messages[1].user.nickname).toBe("新名");
  });

  it("SET_SEND_ERROR 设置发送错误文案", () => {
    const state = makeState();
    const next = chatReducer(state, { type: "SET_SEND_ERROR", payload: "发送失败" });
    expect(next.sendError).toBe("发送失败");
  });

  it("SET_SOCKET_ERROR 设置连接错误文案", () => {
    const state = makeState();
    const next = chatReducer(state, { type: "SET_SOCKET_ERROR", payload: "实时连接失败" });
    expect(next.socketError).toBe("实时连接失败");
  });
});

// ============================================================
// chatReducer — 边界条件
// ============================================================

describe("chatReducer 边界条件", () => {
  it("UPDATE_PRESENCE_ONLINE 的 user 为 null 且用户不在列表 → 不添加任何用户", () => {
    const state = makeState({ presenceUsers: [makePresenceUser("u1")] });
    const action: ChatAction = {
      type: "UPDATE_PRESENCE_ONLINE",
      payload: { userId: "u9", onlineUserIds: ["u1"] }
    };
    const next = chatReducer(state, action);
    expect(next.presenceUsers).toHaveLength(1);
  });

  it("UPDATE_PRESENCE_ONLINE 的 onlineUserIds 为空 → 所有人离线", () => {
    const state = makeState({ presenceUsers: [makePresenceUser("u1", true), makePresenceUser("u2", true)] });
    const action: ChatAction = {
      type: "UPDATE_PRESENCE_ONLINE",
      payload: { userId: "u9", onlineUserIds: [] }
    };
    const next = chatReducer(state, action);
    expect(next.presenceUsers.every((u) => u.isOnline === false)).toBe(true);
  });

  it("ADD_MESSAGE 到空列表 → 正常追加", () => {
    const state = makeState();
    const next = chatReducer(state, { type: "ADD_MESSAGE", payload: makeMessage(1) });
    expect(next.messages).toEqual([makeMessage(1)]);
  });

  it("UPDATE_USER_IN_PRESENCE 无匹配用户 → 原数组不变", () => {
    const state = makeState({ presenceUsers: [makePresenceUser("u1")] });
    const action: ChatAction = { type: "UPDATE_USER_IN_PRESENCE", payload: makeUser("u9") };
    const next = chatReducer(state, action);
    expect(next.presenceUsers).toEqual(state.presenceUsers);
  });

  it("UPDATE_USER_IN_MESSAGES 无匹配用户 → 原数组不变", () => {
    const state = makeState({ messages: [makeMessage(1, "u1")] });
    const action: ChatAction = { type: "UPDATE_USER_IN_MESSAGES", payload: makeUser("u9") };
    const next = chatReducer(state, action);
    expect(next.messages).toEqual(state.messages);
  });

  it("CLEAR 之后状态等于 createInitialState()", () => {
    const state = makeState({
      messages: [makeMessage(1)],
      presenceUsers: [makePresenceUser("u1")],
      sendError: "错误",
      socketError: "连接错误"
    });
    expect(chatReducer(state, { type: "CLEAR" })).toEqual(createInitialState());
  });

  it("未知 action type 返回原 state（不崩溃）", () => {
    const state = makeState();
    const action = { type: "UNKNOWN_ACTION" } as unknown as ChatAction;
    expect(chatReducer(state, action)).toBe(state);
  });

  it("reducer 返回新对象，不修改原 state（不可变性）", () => {
    const state = makeState({ messages: [makeMessage(1)] });
    const next = chatReducer(state, { type: "ADD_MESSAGE", payload: makeMessage(2) });
    expect(next).not.toBe(state);
    expect(state.messages).toEqual([makeMessage(1)]); // 原 state 未变
  });
});

// ============================================================
// sendMessage — 错误路径（Provider 集成）
// ============================================================

describe("sendMessage 错误路径", () => {
  it("getSharedSocket() 为 null → SET_SEND_ERROR(连接未建立) + throw，且不 emit", async () => {
    const { result } = await renderChat();
    // renderHook 时 effect 已建 socket，这里手动覆盖为 null 模拟"共享连接不存在"
    socketMock.setShared(null);

    await act(async () => {
      await expect(
        result.current.sendMessage({ content: "hi", imageFile: null, fileFile: null })
      ).rejects.toThrow("Socket not connected.");
    });
    expect(result.current.sendError).toBe("连接未建立，暂时无法发送。");
    expect(socketMock.emitCalls).toHaveLength(0);
  });

  it("无 token → SET_SEND_ERROR(登录已失效) + throw", async () => {
    // 先有 token 渲染（effect 建 socket），再切到无 token，保证 socket 存在而 token 为 null
    mockAuth("t1", "u1");
    const { result, rerender } = await renderChat();

    mockAuth(null, null);
    rerender();

    await act(async () => {
      await expect(
        result.current.sendMessage({ content: "hi", imageFile: null, fileFile: null })
      ).rejects.toThrow("Missing token.");
    });
    expect(result.current.sendError).toBe("登录已失效，请重新打开小鳄龙。");
  });

  it("图片 + 文件同时 → throw(Only one attachment) + 不 emit", async () => {
    const { result } = await renderChat();

    await act(async () => {
      await expect(
        result.current.sendMessage({
          content: "hi",
          imageFile: new File(["x"], "a.png", { type: "image/png" }),
          fileFile: new File(["x"], "a.txt", { type: "text/plain" })
        })
      ).rejects.toThrow("Only one attachment is allowed per message.");
    });
    expect(result.current.sendError).toBe("Only one attachment is allowed per message.");
    expect(socketMock.emitCalls).toHaveLength(0);
  });

  it("图片上传失败 → SET_SEND_ERROR + throw", async () => {
    apiMock.uploadChatImage.mockRejectedValue(new Error("上传服务器错误"));
    const { result } = await renderChat();

    await act(async () => {
      await expect(
        result.current.sendMessage({
          content: "hi",
          imageFile: new File(["x"], "a.png", { type: "image/png" }),
          fileFile: null
        })
      ).rejects.toThrow("上传服务器错误");
    });
    expect(result.current.sendError).toBe("上传服务器错误");
  });

  it("文件上传失败 → SET_SEND_ERROR + throw", async () => {
    apiMock.uploadChatFile.mockRejectedValue(new Error("文件服务器错误"));
    const { result } = await renderChat();

    await act(async () => {
      await expect(
        result.current.sendMessage({
          content: "hi",
          imageFile: null,
          fileFile: new File(["x"], "a.txt", { type: "text/plain" })
        })
      ).rejects.toThrow("文件服务器错误");
    });
    expect(result.current.sendError).toBe("文件服务器错误");
  });

  it("ack 返回 !ok → SET_SEND_ERROR + throw", async () => {
    const { result } = await renderChat();

    await act(async () => {
      const promise = result.current.sendMessage({ content: "hi", imageFile: null, fileFile: null });
      socketMock.getLastAck()!({ ok: false, error: "服务器拒绝" });
      await promise.catch(() => {});
    });
    expect(result.current.sendError).toBe("服务器拒绝");
  });

  it("ack 5 秒超时 → SET_SEND_ERROR(Message send timeout.) + throw", async () => {
    vi.useFakeTimers();
    try {
      const { result } = await renderChat();

      await act(async () => {
        const promise = result.current.sendMessage({ content: "hi", imageFile: null, fileFile: null });
        vi.advanceTimersByTime(5000);
        await promise.catch(() => {});
      });
      expect(result.current.sendError).toBe("Message send timeout.");
    } finally {
      vi.useRealTimers();
    }
  });
});

// ============================================================
// sendMessage — 正常路径（Provider 集成）
// ============================================================

describe("sendMessage 正常路径", () => {
  it("纯文字消息 → emit chat:send 成功，无错误", async () => {
    const { result } = await renderChat();

    await act(async () => {
      const promise = result.current.sendMessage({ content: "hi", imageFile: null, fileFile: null });
      socketMock.getLastAck()!({ ok: true });
      await promise;
    });
    expect(socketMock.emitCalls).toHaveLength(1);
    expect(socketMock.emitCalls[0].event).toBe("chat:send");
    expect(socketMock.emitCalls[0].payload).toEqual({ content: "hi", image: null, file: null });
    expect(result.current.sendError).toBeNull();
  });

  it("带图片 → 先 uploadChatImage 再 emit（image 传入）", async () => {
    apiMock.uploadChatImage.mockResolvedValue({ image: makeImage() });
    const { result } = await renderChat();

    await act(async () => {
      const promise = result.current.sendMessage({
        content: "看图",
        imageFile: new File(["x"], "a.png", { type: "image/png" }),
        fileFile: null
      });
      await triggerLastAck({ ok: true });
      await promise;
    });
    expect(apiMock.uploadChatImage).toHaveBeenCalledTimes(1);
    expect((socketMock.emitCalls[0].payload as { image: ChatImage }).image).toEqual(makeImage());
  });

  it("带文件 → 先 uploadChatFile 再 emit（file 传入）", async () => {
    apiMock.uploadChatFile.mockResolvedValue({ file: makeFile() });
    const { result } = await renderChat();

    await act(async () => {
      const promise = result.current.sendMessage({
        content: "看文件",
        imageFile: null,
        fileFile: new File(["x"], "a.txt", { type: "text/plain" })
      });
      await triggerLastAck({ ok: true });
      await promise;
    });
    expect(apiMock.uploadChatFile).toHaveBeenCalledTimes(1);
    expect((socketMock.emitCalls[0].payload as { file: ChatFile }).file).toEqual(makeFile());
  });
});

// ============================================================
// 聊天历史加载 — 错误路径
// ============================================================

describe("聊天历史加载", () => {
  it("加载失败（非 401）→ SET_SOCKET_ERROR(聊天记录暂时未加载)", async () => {
    apiMock.getRecentMessages.mockRejectedValue(new Error("network down"));
    const { result } = await renderChat();

    await act(async () => {});
    expect(result.current.socketError).toBe("聊天记录暂时未加载，实时连接仍会继续重试。");
  });

  it("加载 401 → 注销失效会话", async () => {
    apiMock.getRecentMessages.mockRejectedValue(new apiMock.MockApiError(401));
    const { result } = await renderChat();

    await act(async () => {});
    expect(result.current.socketError).toBeNull();
    expect(invalidateSessionMock).toHaveBeenCalledWith("t1");
  });

  it("加载成功 → messages 被填充", async () => {
    apiMock.getRecentMessages.mockResolvedValue({ messages: [makeMessage(1)], hasMore: true, nextBeforeId: 1 });
    const { result } = await renderChat();

    await act(async () => {});
    expect(result.current.messages).toEqual([makeMessage(1)]);
    expect(result.current.historyInitialized).toBe(true);
    expect(result.current.hasOlderMessages).toBe(true);
  });

  it("向上分页用最早消息 id 加载并合并更早记录", async () => {
    apiMock.getRecentMessages
      .mockResolvedValueOnce({ messages: [makeMessage(51), makeMessage(52)], hasMore: true, nextBeforeId: 51 })
      .mockResolvedValueOnce({ messages: [makeMessage(49), makeMessage(50)], hasMore: false, nextBeforeId: null });
    const { result } = await renderChat();

    await act(async () => {
      await result.current.loadOlderMessages();
    });

    expect(apiMock.getRecentMessages).toHaveBeenLastCalledWith("t1", 50, 51);
    expect(result.current.messages.map((message) => message.id)).toEqual([49, 50, 51, 52]);
    expect(result.current.hasOlderMessages).toBe(false);
    expect(result.current.loadingOlderMessages).toBe(false);
  });

  it("旧服务端忽略 beforeId 且没有更早 id 时停止继续分页", async () => {
    const recentPage = Array.from({ length: 50 }, (_, index) => makeMessage(index + 51));
    apiMock.getRecentMessages
      .mockResolvedValueOnce({ messages: recentPage })
      .mockResolvedValueOnce({ messages: recentPage });
    const { result } = await renderChat();

    await act(async () => {
      await result.current.loadOlderMessages();
    });

    expect(result.current.hasOlderMessages).toBe(false);
    expect(result.current.messages.map((message) => message.id)).toEqual(recentPage.map((message) => message.id));
  });

  it("更早记录加载失败会保留重试资格和现有消息", async () => {
    apiMock.getRecentMessages
      .mockResolvedValueOnce({ messages: [makeMessage(51)], hasMore: true, nextBeforeId: 51 })
      .mockRejectedValueOnce(new Error("network down"));
    const { result } = await renderChat();

    await act(async () => {
      await result.current.loadOlderMessages();
    });

    expect(result.current.messages).toEqual([makeMessage(51)]);
    expect(result.current.hasOlderMessages).toBe(true);
    expect(result.current.olderMessagesError).toBe("更早的消息暂时未加载，请稍后重试。");
  });
});

// ============================================================
// Provider / 状态转换
// ============================================================

describe("Provider / 状态转换", () => {
  it("useChat 在 ChatProvider 外调用 → 抛错", () => {
    expect(() => renderHook(() => useChat())).toThrow(
      "useChat must be used within ChatProvider"
    );
  });

  it("ChatProvider 正常渲染子组件", async () => {
    render(
      <ChatProvider>
        <div data-testid="child">hello</div>
      </ChatProvider>
    );
    await act(async () => {});
    expect(screen.getByTestId("child").textContent).toBe("hello");
  });

  it("socket 事件驱动状态：presence:init / chat:message 更新数据", async () => {
    const { result } = await renderChat();

    act(() => {
      socketMock.getShared()!._trigger("presence:init", { users: [makePresenceUser("u1")] });
      socketMock.getShared()!._trigger("chat:message", makeMessage(1));
    });
    expect(result.current.presenceUsers).toEqual([makePresenceUser("u1")]);
    expect(result.current.messages).toEqual([makeMessage(1)]);
  });

  it("登出（token→null）→ CLEAR 被 dispatch，状态重置", async () => {
    const { result, rerender } = await renderChat();

    // 先灌入数据
    act(() => {
      socketMock.getShared()!._trigger("presence:init", { users: [makePresenceUser("u1")] });
      socketMock.getShared()!._trigger("chat:message", makeMessage(1));
    });
    expect(result.current.presenceUsers).toHaveLength(1);
    expect(result.current.messages).toHaveLength(1);
    result.current.scrollMemoryRef.current = {
      scrollTop: 120,
      atBottom: false,
      anchorMessageId: 1,
      anchorOffset: 4,
      lastMessageId: 1,
      firstUnreadMessageId: 1,
      unreadCount: 1
    };

    // 登出：token 变 null
    mockAuth(null, null);
    rerender();

    expect(result.current.messages).toEqual([]);
    expect(result.current.presenceUsers).toEqual([]);
    expect(result.current.scrollMemoryRef.current).toBeNull();
  });

  it("desktopRole=avatar 时不监听 chat:message，但其他事件照常监听", async () => {
    mockDesktop("avatar");
    await renderChat();

    const socket = socketMock.getShared()!;
    expect(socket._listeners.has("chat:message")).toBe(false);
    expect(socket._listeners.get("presence:init")?.size).toBeGreaterThan(0);
    expect(socket._listeners.get("user:update")?.size).toBeGreaterThan(0);
  });

  it("cleanup 时逐个 off 自己注册的监听器（共享 socket 不残留）", async () => {
    const { unmount } = await renderChat();

    const socket = socketMock.getShared()!;
    // 挂载时 chat:message 已注册
    expect(socket._listeners.get("chat:message")?.size).toBe(1);

    unmount();
    // 卸载后所有事件的监听器都被精确 off
    for (const handlers of socket._listeners.values()) {
      expect(handlers.size).toBe(0);
    }
  });

});

// ============================================================
// 重连 / 网络恢复补拉
// ============================================================

describe("重连 / 网络恢复补拉", () => {
  it("每次 connect 都补拉，覆盖首次历史请求与 Socket 建连之间的空档", async () => {
    await renderChat();
    expect(apiMock.getRecentMessages).toHaveBeenCalledTimes(1);

    act(() => {
      socketMock.getShared()!._trigger("connect", undefined);
    });
    await act(async () => {});
    expect(apiMock.getRecentMessages).toHaveBeenCalledTimes(2);
  });

  it("重连 → 补拉历史并合并遗漏消息", async () => {
    apiMock.getRecentMessages.mockResolvedValueOnce({ messages: [makeMessage(1)] });
    const { result } = await renderChat();
    expect(result.current.messages).toEqual([makeMessage(1)]);

    apiMock.getRecentMessages.mockResolvedValueOnce({ messages: [makeMessage(1), makeMessage(2)] });
    act(() => {
      socketMock.getShared()!._trigger("connect", undefined);
    });
    await act(async () => {});

    expect(apiMock.getRecentMessages).toHaveBeenCalledTimes(2);
    expect(result.current.messages.map((m) => m.id)).toEqual([1, 2]);
  });

  it("旧会话补拉在 token 切换后完成时不会串入新账号", async () => {
    let resolveOldRequest!: (value: { messages: ChatMessage[] }) => void;
    const oldRequest = new Promise<{ messages: ChatMessage[] }>((resolve) => {
      resolveOldRequest = resolve;
    });
    apiMock.getRecentMessages
      .mockResolvedValueOnce({ messages: [] })
      .mockReturnValueOnce(oldRequest)
      .mockResolvedValue({ messages: [] });

    const { result, rerender } = await renderChat();
    act(() => {
      socketMock.getShared()!._trigger("connect", undefined);
    });

    mockAuth("t2", "u2");
    rerender();
    await act(async () => {
      resolveOldRequest({ messages: [makeMessage(9, "u1", "旧账号消息")] });
    });

    expect(result.current.messages).toEqual([]);
  });

  it("补拉 401 使用请求 token 条件失效会话", async () => {
    apiMock.getRecentMessages
      .mockResolvedValueOnce({ messages: [] })
      .mockRejectedValueOnce(new apiMock.MockApiError(401));
    await renderChat();

    act(() => {
      socketMock.getShared()!._trigger("connect", undefined);
    });
    await act(async () => {});

    expect(invalidateSessionMock).toHaveBeenCalledWith("t1");
  });

  it("online 与 connect 在补拉期间相邻触发时会排队再同步一次", async () => {
    let resolveFirstResync!: (value: { messages: ChatMessage[] }) => void;
    const firstResync = new Promise<{ messages: ChatMessage[] }>((resolve) => {
      resolveFirstResync = resolve;
    });
    apiMock.getRecentMessages
      .mockResolvedValueOnce({ messages: [] })
      .mockReturnValueOnce(firstResync)
      .mockResolvedValueOnce({ messages: [makeMessage(2)] });
    const { result } = await renderChat();

    act(() => {
      window.dispatchEvent(new Event("online"));
      socketMock.getShared()!._trigger("connect", undefined);
    });
    await act(async () => {
      resolveFirstResync({ messages: [makeMessage(1)] });
    });

    expect(apiMock.getRecentMessages).toHaveBeenCalledTimes(3);
    expect(result.current.messages.map((message) => message.id)).toEqual([1, 2]);
  });

  it("online 事件 → 补拉历史并合并", async () => {
    apiMock.getRecentMessages.mockResolvedValueOnce({ messages: [makeMessage(1)] });
    const { result } = await renderChat();

    apiMock.getRecentMessages.mockResolvedValueOnce({ messages: [makeMessage(1), makeMessage(2)] });
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await act(async () => {});

    expect(apiMock.getRecentMessages).toHaveBeenCalledTimes(2);
    expect(result.current.messages.map((m) => m.id)).toEqual([1, 2]);
  });

  it("avatar 角色重连不补拉", async () => {
    mockDesktop("avatar");
    await renderChat();
    expect(apiMock.getRecentMessages).toHaveBeenCalledTimes(1);

    act(() => {
      socketMock.getShared()!._trigger("connect", undefined);
    });
    await act(async () => {});

    expect(apiMock.getRecentMessages).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// scrollMemoryRef — 方案 A（Provider 常驻，跨挂载保留）
// ============================================================

describe("scrollMemoryRef（方案 A）", () => {
  function makeMemory(): ChatScrollMemory {
    return {
      scrollTop: 120,
      atBottom: false,
      anchorMessageId: 3,
      anchorOffset: 10,
      lastMessageId: 5,
      firstUnreadMessageId: 4,
      unreadCount: 2
    };
  }

  it("Provider 挂载后暴露 ref，初始为 null", async () => {
    const { result } = await renderChat();
    expect(result.current.scrollMemoryRef.current).toBeNull();
  });

  it("同一 Provider 内引用稳定，写入后保留", async () => {
    const { result } = await renderChat();
    const firstRef = result.current.scrollMemoryRef;

    const memory = makeMemory();
    firstRef.current = memory;

    // 再次读取：同一引用（useRef 恒定），内容保留
    expect(result.current.scrollMemoryRef).toBe(firstRef);
    expect(result.current.scrollMemoryRef.current).toEqual(memory);
  });

  it("Provider 卸载后重建得到新 ref（ref 生命周期绑定 Provider）", async () => {
    const first = await renderChat();
    first.result.current.scrollMemoryRef.current = makeMemory();

    first.unmount();
    const second = await renderChat();
    // 新 Provider 实例 → 新 ref，初始为 null（旧值不残留）
    expect(second.result.current.scrollMemoryRef).not.toBe(first.result.current.scrollMemoryRef);
    expect(second.result.current.scrollMemoryRef.current).toBeNull();
  });
});
