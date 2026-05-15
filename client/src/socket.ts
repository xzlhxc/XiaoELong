import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@xiaoelong/shared";
import { serverUrl } from "./env";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function connectSocket(token: string): AppSocket {
  return io(serverUrl, {
    auth: { token }
  });
}
