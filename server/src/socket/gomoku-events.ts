import type { GomokuGame, ServerToClientEvents, ClientToServerEvents } from "@xiaoelong/shared";
import type { Server } from "socket.io";

export function emitGomokuUpdate(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  game: GomokuGame
): void {
  io.to(`user:${game.playerBlack.id}`).emit("gomoku:update", { game });
  io.to(`user:${game.playerWhite.id}`).emit("gomoku:update", { game });
  io.to(`gomoku:${game.id}`).emit("gomoku:update", { game });
  if (game.status === "finished") {
    io.to(`gomoku:${game.id}`).emit("gomoku:end", { game, winner: game.winner });
  }
}
