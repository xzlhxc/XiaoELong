import type {
  ClientToServerEvents,
  GomokuAcceptPayload,
  GomokuInvitePayload,
  GomokuMovePayload,
  PresenceUser,
  ServerToClientEvents
} from "@xiaoelong/shared";
import type { Server, Socket } from "socket.io";
import { listDailyMoodsByUserId } from "../db/daily-moods.js";
import { createMessage } from "../db/messages.js";
import { listUsers, getUserById } from "../db/users.js";
import { GomokuService, GomokuValidationError } from "../services/gomoku-service.js";
import { normalizeChatContent } from "../utils/chat.js";
import { verifyAccessToken } from "../utils/jwt.js";

const MAIN_ROOM = "room:main";

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

interface SocketData {
  userId: string;
}

const socketIdsByUserId = new Map<string, Set<string>>();

interface SocketSetupDependencies {
  gomokuService: GomokuService;
}

function getOnlineUserIds(): string[] {
  return Array.from(socketIdsByUserId.entries())
    .filter((entry) => entry[1].size > 0)
    .map((entry) => entry[0]);
}

function addOnlineSocket(userId: string, socketId: string): boolean {
  const existing = socketIdsByUserId.get(userId);
  if (existing) {
    existing.add(socketId);
    return false;
  }

  socketIdsByUserId.set(userId, new Set([socketId]));
  return true;
}

function removeOnlineSocket(userId: string, socketId: string): boolean {
  const existing = socketIdsByUserId.get(userId);
  if (!existing) {
    return false;
  }

  existing.delete(socketId);
  if (existing.size > 0) {
    return false;
  }

  socketIdsByUserId.delete(userId);
  return true;
}

export async function listPresenceUsers(): Promise<PresenceUser[]> {
  const allUsers = await listUsers();
  const onlineSet = new Set(getOnlineUserIds());
  const moodsByUserId = await listDailyMoodsByUserId();
  return allUsers.map((user) => ({
    ...user,
    isOnline: onlineSet.has(user.id),
    todayMood: moodsByUserId.get(user.id) ?? null
  }));
}

function emitGomokuUpdate(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  game: import("@xiaoelong/shared").GomokuGame
): void {
  io.to(`user:${game.playerBlack.id}`).emit("gomoku:update", { game });
  io.to(`user:${game.playerWhite.id}`).emit("gomoku:update", { game });
  io.to(`gomoku:${game.id}`).emit("gomoku:update", { game });
  if (game.status === "finished") {
    io.to(`gomoku:${game.id}`).emit("gomoku:end", { game, winner: game.winner });
  }
}

export function setupSocket(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  dependencies: SocketSetupDependencies
): void {
  io.use(async (socket, next) => {
    const rawToken = socket.handshake.auth?.token;
    const token = typeof rawToken === "string" ? rawToken : null;
    if (!token) {
      next(new Error("Unauthorized."));
      return;
    }

    try {
      const claims = verifyAccessToken(token);
      const user = await getUserById(claims.sub);
      if (!user) {
        next(new Error("Unauthorized."));
        return;
      }

      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error("Unauthorized."));
    }
  });

  io.on("connection", async (socket: AppSocket) => {
    const { userId } = socket.data;
    socket.join(MAIN_ROOM);
    socket.join(`user:${userId}`);

    const isFirstConnection = addOnlineSocket(userId, socket.id);

    try {
      const presenceUsers = await listPresenceUsers();
      const currentUser = presenceUsers.find((user) => user.id === userId);
      socket.emit("presence:init", {
        users: presenceUsers
      });

      if (isFirstConnection) {
        io.to(MAIN_ROOM).emit("presence:online", {
          userId,
          onlineUserIds: getOnlineUserIds(),
          user: currentUser
        });
      }

      const activeGameIds = await dependencies.gomokuService.listActiveGameIdsForUser(userId);
      for (const gameId of activeGameIds) {
        socket.join(`gomoku:${gameId}`);
      }
    } catch {
      socket.disconnect(true);
      return;
    }

    socket.on("chat:send", async (payload, ack) => {
      const normalized = normalizeChatContent(payload?.content);
      if (!normalized.ok) {
        ack?.({
          ok: false,
          error: normalized.error
        });
        return;
      }

      try {
        const message = await createMessage(userId, normalized.content);
        io.to(MAIN_ROOM).emit("chat:message", message);
        ack?.({ ok: true });
      } catch {
        ack?.({
          ok: false,
          error: "Failed to send message."
        });
      }
    });

    socket.on("gomoku:invite", async (payload: GomokuInvitePayload, ack) => {
      try {
        const game = await dependencies.gomokuService.createInvite(userId, payload.targetUserId);
        socket.join(`gomoku:${game.id}`);
        emitGomokuUpdate(io, game);
        ack?.({ ok: true, game });
      } catch (error) {
        if (error instanceof GomokuValidationError) {
          ack?.({ ok: false, error: error.message });
          return;
        }
        ack?.({ ok: false, error: "Failed to create game invite." });
      }
    });

    socket.on("gomoku:accept", async (payload: GomokuAcceptPayload, ack) => {
      try {
        const game = await dependencies.gomokuService.acceptInvite(payload.gameId, userId);
        socket.join(`gomoku:${game.id}`);
        emitGomokuUpdate(io, game);
        ack?.({ ok: true, game });
      } catch (error) {
        if (error instanceof GomokuValidationError) {
          ack?.({ ok: false, error: error.message });
          return;
        }
        ack?.({ ok: false, error: "Failed to accept game invite." });
      }
    });

    socket.on("gomoku:move", async (payload: GomokuMovePayload, ack) => {
      try {
        const game = await dependencies.gomokuService.makeMove(payload.gameId, userId, payload.row, payload.col);
        emitGomokuUpdate(io, game);
        ack?.({ ok: true, game });
      } catch (error) {
        if (error instanceof GomokuValidationError) {
          ack?.({ ok: false, error: error.message });
          return;
        }
        ack?.({ ok: false, error: "Failed to apply gomoku move." });
      }
    });

    socket.on("disconnect", () => {
      const isNowOffline = removeOnlineSocket(userId, socket.id);
      if (!isNowOffline) {
        return;
      }

      io.to(MAIN_ROOM).emit("presence:offline", {
        userId,
        onlineUserIds: getOnlineUserIds()
      });
    });
  });
}
