import { useMemo, useState } from "react";
import type { GomokuGame, PresenceUser, UserProfile } from "@xiaoelong/shared";
import { UserAvatar } from "./UserAvatar";

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

function MiniAvatar(props: { user: UserProfile; dim?: boolean }): JSX.Element {
  return <UserAvatar user={props.user} dim={props.dim} />;
}

function Board(props: {
  game: GomokuGame;
  currentUserId: string;
  onMove: (row: number, col: number) => void;
}): JSX.Element {
  const canMove = props.game.status === "playing" && props.game.currentTurn === props.currentUserId;
  return (
    <div className="gomoku-board" aria-label="五子棋棋盘">
      {props.game.boardState.map((rowCells, row) =>
        rowCells.map((cell, col) => {
          const stoneClass = cell === 1 ? "black" : cell === 2 ? "white" : "empty";
          return (
            <button
              key={`${row}-${col}`}
              type="button"
              className={`gomoku-cell ${stoneClass}`}
              disabled={!canMove || cell !== 0}
              aria-label={`第 ${row + 1} 行第 ${col + 1} 列`}
              onClick={() => props.onMove(row, col)}
            />
          );
        })
      )}
    </div>
  );
}

export function GomokuPanel(props: GomokuPanelProps): JSX.Element {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitingUserId, setInvitingUserId] = useState<string | null>(null);
  const selectedGame = useMemo(
    () => props.games.find((game) => game.id === props.selectedGameId) ?? props.games[0] ?? null,
    [props.games, props.selectedGameId]
  );

  const inviteCandidates = props.users.filter((user) => user.id !== props.currentUser.id);

  async function handleInvite(userId: string): Promise<void> {
    setInvitingUserId(userId);
    try {
      await props.onInvite(userId);
      setInviteOpen(false);
    } finally {
      setInvitingUserId(null);
    }
  }

  return (
    <section className="module-card gomoku-card">
      <div className="module-head">
        <h2>五子棋</h2>
        <div className="gomoku-actions">
          <div className="invite-popover-wrap">
            <button type="button" className="primary-soft-button" onClick={() => setInviteOpen((open) => !open)}>
              邀请
            </button>
            {inviteOpen ? (
              <div className="invite-popover" role="dialog" aria-label="选择邀请成员">
                <div className="invite-popover-head">
                  <strong>选择成员</strong>
                  <button type="button" className="icon-text-button" onClick={() => setInviteOpen(false)}>
                    关闭
                  </button>
                </div>
                <div className="invite-candidate-list">
                  {inviteCandidates.length === 0 ? <p className="muted-text">还没有可邀请的成员。</p> : null}
                  {inviteCandidates.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className={`invite-candidate ${candidate.isOnline ? "online" : "offline"}`}
                      disabled={invitingUserId !== null}
                      onClick={() => void handleInvite(candidate.id)}
                    >
                      <MiniAvatar user={candidate} dim={!candidate.isOnline} />
                      <span>{candidate.nickname}</span>
                      <small>{candidate.isOnline ? "在线" : "离线"}</small>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <button type="button" className="ghost-button" onClick={() => void props.onRefresh()}>
            刷新
          </button>
        </div>
      </div>

      <div className="gomoku-layout">
        <aside className="gomoku-left">
          <h3>我的对局</h3>
          <div className="gomoku-game-list">
            {props.loading ? <p className="muted-text">加载中...</p> : null}
            {!props.loading && props.games.length === 0 ? <p className="muted-text">还没有对局。</p> : null}
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
                  <span>
                    <strong>{opponent.nickname}</strong>
                    <small>#{game.id}</small>
                  </span>
                  <em>{formatStatus(game)}</em>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="gomoku-right">
          {!selectedGame ? <p className="muted-text">先邀请一位成员开始对局。</p> : null}
          {selectedGame ? (
            <>
              <div className="gomoku-game-head">
                <div>
                  <strong>对局 #{selectedGame.id}</strong>
                  <span>对手：{getOpponent(selectedGame, props.currentUser.id).nickname}</span>
                </div>
                <em>{formatStatus(selectedGame)}</em>
              </div>

              {selectedGame.status === "invited" && selectedGame.playerWhite.id === props.currentUser.id ? (
                <button type="button" className="primary-soft-button" onClick={() => void props.onAccept(selectedGame.id)}>
                  接受邀请
                </button>
              ) : null}

              {selectedGame.status === "playing" ? (
                <p className="gomoku-tip">
                  当前回合：{selectedGame.currentTurn === props.currentUser.id ? "你" : getOpponent(selectedGame, props.currentUser.id).nickname}
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
