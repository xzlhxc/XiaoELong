export interface UserProfile {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface PresenceUser extends UserProfile {
  isOnline: boolean;
}

export interface ChatMessage {
  id: number;
  user: UserProfile;
  content: string;
  createdAt: string;
}

export interface AuthJoinResponse {
  accessToken: string;
  user: UserProfile;
}

export interface AuthMeResponse {
  user: UserProfile;
}

export interface ChatHistoryResponse {
  messages: ChatMessage[];
}

export interface DailyQuestion {
  id: number;
  date: string;
  question: string;
  options: string[];
  sourceType: "online" | "fallback" | "manual";
  sourceContext: string | null;
  createdAt: string;
}

export interface DailyQuestionStats {
  questionId: number;
  counts: number[];
  totalAnswers: number;
}

export interface DailyQuestionTodayResponse {
  question: DailyQuestion;
  stats: DailyQuestionStats;
  answeredIndex: number | null;
}

export interface DailyQuestionAnswerResponse {
  ok: true;
  stats: DailyQuestionStats;
  answeredIndex: number;
}

export interface GomokuGame {
  id: number;
  status: "invited" | "playing" | "finished" | "declined";
  playerBlack: UserProfile;
  playerWhite: UserProfile;
  currentTurn: string | null;
  winner: string | null;
  boardState: number[][];
  invitedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface GomokuGamesResponse {
  games: GomokuGame[];
}

export interface GomokuInviteResponse {
  game: GomokuGame;
}

export interface GomokuMoveResponse {
  game: GomokuGame;
}

export interface PresenceInitPayload {
  users: PresenceUser[];
}

export interface PresenceDeltaPayload {
  userId: string;
  onlineUserIds: string[];
  user?: UserProfile;
}

export interface ChatSendPayload {
  content: string;
}

export interface ChatSendAck {
  ok: boolean;
  error?: string;
}

export interface DailyQuestionUpdatePayload {
  questionId: number;
  stats: DailyQuestionStats;
}

export interface GomokuInvitePayload {
  targetUserId: string;
}

export interface GomokuAcceptPayload {
  gameId: number;
}

export interface GomokuMovePayload {
  gameId: number;
  row: number;
  col: number;
}

export interface GomokuUpdatePayload {
  game: GomokuGame;
}

export interface GomokuEndPayload {
  game: GomokuGame;
  winner: string | null;
}

export interface BasicAck {
  ok: boolean;
  error?: string;
}

export interface GomokuAck extends BasicAck {
  game?: GomokuGame;
}

export interface ServerToClientEvents {
  "presence:init": (payload: PresenceInitPayload) => void;
  "presence:online": (payload: PresenceDeltaPayload) => void;
  "presence:offline": (payload: PresenceDeltaPayload) => void;
  "chat:message": (message: ChatMessage) => void;
  "question:update": (payload: DailyQuestionUpdatePayload) => void;
  "gomoku:update": (payload: GomokuUpdatePayload) => void;
  "gomoku:end": (payload: GomokuEndPayload) => void;
}

export interface ClientToServerEvents {
  "chat:send": (payload: ChatSendPayload, ack?: (result: ChatSendAck) => void) => void;
  "gomoku:invite": (payload: GomokuInvitePayload, ack?: (result: GomokuAck) => void) => void;
  "gomoku:accept": (payload: GomokuAcceptPayload, ack?: (result: GomokuAck) => void) => void;
  "gomoku:move": (payload: GomokuMovePayload, ack?: (result: GomokuAck) => void) => void;
}
