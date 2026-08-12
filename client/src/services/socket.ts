import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@xiaoelong/shared";
import { serverUrl } from "../config/env";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/** 模块级共享 socket 单例，供各 Context 复用 */
let sharedSocket: AppSocket | null = null;
/** 当前共享 socket 对应的 token，用于判断是否需要为不同用户重建 */
let sharedToken: string | null = null;

/** 新建一个不共享的 socket 连接 */
export function connectSocket(token: string): AppSocket {
  return io(serverUrl, {
    auth: { token }
  });
}

/**
 * 获取或创建共享 socket 连接。
 * 同一 token 复用同一连接（无论连接状态），避免多个 Context 在挂载时
 * 因"尚未 connected"而互相断开重建，导致先挂载的 Context 的监听永久失效。
 * 仅当 token 变化（切换用户）或登出后重新获取时才重建。
 */
export function getOrCreateSocket(token: string): AppSocket {
  if (sharedSocket && sharedToken === token) {
    return sharedSocket;
  }
  sharedSocket?.disconnect();
  sharedSocket = connectSocket(token);
  sharedToken = token;
  return sharedSocket;
}

/** 只读获取当前共享 socket，未建立过则返回 null（不触发创建） */
export function getSharedSocket(): AppSocket | null {
  return sharedSocket;
}

/** 断开共享 socket 连接并清空引用 */
export function disconnectSharedSocket(): void {
  sharedSocket?.disconnect();
  sharedSocket = null;
  sharedToken = null;
}
