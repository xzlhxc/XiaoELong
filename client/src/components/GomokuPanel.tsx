import { useMemo } from "react";
import type { GomokuGame, PresenceUser, UserProfile } from "@xiaoelong/shared";
import { withServerUrl } from "../env";

interface GomokuPanelProps {
  currentUser: UserProfile;
  users: PresenceUser[];
  games: GomokuGame[];
  selectedGameId: number | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => Promise<void>;
  onSelectGame: (gameId: number) => void;
  onInvite: (targetUserId: string) => Promise<void>;
  onAccept: (gameId: number) => Promise<void>;
  onMove: (gameId: number, row: number, col: number) => Promise<void>;
}

function getOpponent(game: GomokuGame, userId: string): UserProfile {
  return game.playerBlack.id === userId ? game.playerWhite : game.playerBlack;
}

function formatStatus(game: GomokuGame): string {
  if (game.status === "invited") {
    return "待接受";
  }
  if (game.status === "playing") {
    return "进行中";
  }
  if (game.status === "finished") {
    return "已结束";
  }
  return "已拒绝";
}

function Board(props: {
  game: GomokuGame;
  currentUserId: string;
  onMove: (row: number, col: number) => void;
}): JSX.Element {
  const canMove = props.game.status === "playing" && props.game.currentTurn === props.currentUserId;
  return (
    <div className="gomoku-board">
      {props.game.boardState.map((rowCells, row) =>
        rowCells.map((cell, col) => {
          const stoneClass = cell === 1 ? "black" : cell === 2 ? "white" : "empty";
          return (
            <button
              key={`${row}-${col}`}
              type="button"
              className={`gomoku-cell ${stoneClass}`}
              disabled={!canMove || cell !== 0}
              onClick={() => props.onMove(row, col)}
            />
          );
        })
      )}
    </div>
  );
}

export function GomokuPanel(props: GomokuPanelProps): JSX.Element {
  const selectedGame = useMemo(
    () => props.games.find((game) => game.id === props.selectedGameId) ?? props.games[0] ?? null,
    [props.games, props.selectedGameId]
  );

  const inviteCandidates = props.users.filter((user) => user.id !== props.currentUser.id);

  return (
    <section className="module-card">
      <div className="module-head">
        <h2>五子棋</h2>
        <button type="button" onClick={() => void props.onRefresh()}>
          刷新
        </button>
      </div>

      <div className="gomoku-layout">
        <div className="gomoku-left">
          <h3>发起邀请</h3>
          <div className="gomoku-invite-list">
            {inviteCandidates.map((candidate) => (
              <button key={candidate.id} type="button" onClick={() => void props.onInvite(candidate.id)}>
                {candidate.avatarUrl ? (
                  <img src={withServerUrl(candidate.avatarUrl) || ""} alt={candidate.nickname} className="avatar" />
                ) : (
                  <span className="avatar avatar-fallback">{candidate.nickname.slice(0, 1)}</span>
                )}
                <span>{candidate.nickname}</span>
              </button>
            ))}
          </div>

          <h3>我的对局</h3>
          <div className="gomoku-game-list">
            {props.loading ? <p>加载中...</p> : null}
            {props.games.map((game) => {
              const opponent = getOpponent(game, props.currentUser.id);
              const selected = selectedGame?.id === game.id;
              return (
                <button
                  key={game.id}
                  type="button"
                  className={`gomoku-game-item ${selected ? "selected" : ""}`}
                  onClick={() => props.onSelectGame(game.id)}
                >
                  <strong>#{game.id}</strong>
                  <span>对手：{opponent.nickname}</span>
                  <span>{formatStatus(game)}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="gomoku-right">
          {!selectedGame ? <p>还没有对局，先邀请一位成员吧。</p> : null}
          {selectedGame ? (
            <>
              <div className="gomoku-game-head">
                <strong>对局 #{selectedGame.id}</strong>
                <span>{formatStatus(selectedGame)}</span>
              </div>

              {selectedGame.status === "invited" && selectedGame.playerWhite.id === props.currentUser.id ? (
                <button type="button" onClick={() => void props.onAccept(selectedGame.id)}>
                  接受邀请开始对局
                </button>
              ) : null}

              {selectedGame.status === "playing" ? (
                <p className="gomoku-tip">
                  当前轮到：{selectedGame.currentTurn === props.currentUser.id ? "你" : getOpponent(selectedGame, props.currentUser.id).nickname}
                </p>
              ) : null}

              {selectedGame.status === "finished" ? (
                <p className="gomoku-tip">
                  结果：{selectedGame.winner === props.currentUser.id ? "你获胜" : selectedGame.winner ? "你落败" : "平局"}
                </p>
              ) : null}

              <Board
                game={selectedGame}
                currentUserId={props.currentUser.id}
                onMove={(row, col) => void props.onMove(selectedGame.id, row, col)}
              />
            </>
          ) : null}
        </div>
      </div>

      {props.error ? <p className="error-text">{props.error}</p> : null}
    </section>
  );
}
