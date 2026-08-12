// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { disconnectSharedSocket, getOrCreateSocket } from "./socket";

// ---- Mock socket.io-client：io 返回可控制的假 socket ----

const ioMock = vi.hoisted(() => vi.fn());

vi.mock("socket.io-client", () => ({
  io: ioMock
}));

interface FakeSocket {
  connected: boolean;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

/** 创建"未连接"的假 socket，模拟握手完成前的 connecting 状态 */
function createUnconnectedSocket(): FakeSocket {
  return {
    connected: false,
    on: vi.fn(),
    off: vi.fn(),
    disconnect: vi.fn()
  };
}

describe("getOrCreateSocket 共享单例", () => {
  afterEach(() => {
    ioMock.mockReset();
    disconnectSharedSocket();
  });

  it("同一 token 连续调用应复用同一连接，即使尚未 connected", () => {
    const first = createUnconnectedSocket();
    const second = createUnconnectedSocket();
    ioMock.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const a = getOrCreateSocket("token-a");
    const b = getOrCreateSocket("token-a");

    // 竞态回归保护：两个 Context 在挂载时都会调用，
    // 若因"未连接"就断开重建，先挂载的 Context 的监听会永久失效
    expect(b).toBe(a);
    expect(first.disconnect).not.toHaveBeenCalled();
    expect(ioMock).toHaveBeenCalledTimes(1);
  });

  it("token 变化时应断开旧连接并重建", () => {
    const first = createUnconnectedSocket();
    const second = createUnconnectedSocket();
    ioMock.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const a = getOrCreateSocket("token-a");
    const b = getOrCreateSocket("token-b");

    expect(b).not.toBe(a);
    expect(first.disconnect).toHaveBeenCalled();
    expect(ioMock).toHaveBeenCalledTimes(2);
  });

  it("disconnectSharedSocket 后再次获取应新建连接", () => {
    const first = createUnconnectedSocket();
    const second = createUnconnectedSocket();
    ioMock.mockReturnValueOnce(first).mockReturnValueOnce(second);

    const a = getOrCreateSocket("token-a");
    disconnectSharedSocket();
    expect(first.disconnect).toHaveBeenCalled();

    const b = getOrCreateSocket("token-a");
    expect(b).not.toBe(a);
    expect(ioMock).toHaveBeenCalledTimes(2);
  });
});
