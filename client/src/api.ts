import type {
  AuthJoinResponse,
  AuthMeResponse,
  ChatHistoryResponse,
  DailyQuestionAnswerResponse,
  DailyQuestionStats,
  DailyQuestionTodayResponse,
  GomokuGamesResponse,
  GomokuInviteResponse,
  GomokuMoveResponse
} from "@xiaoelong/shared";
import { serverUrl } from "./env";

type HttpMethod = "GET" | "POST";

interface RequestOptions {
  method?: HttpMethod;
  token?: string;
  body?: BodyInit | null;
}

export class ApiError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${serverUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body ?? null
  });

  const payload = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) {
    throw new ApiError(response.status, payload.message || "Request failed.");
  }

  return payload as T;
}

export async function joinWithInvite(formData: FormData): Promise<AuthJoinResponse> {
  return requestJson<AuthJoinResponse>("/api/auth/join", {
    method: "POST",
    body: formData
  });
}

export async function getMe(token: string): Promise<AuthMeResponse> {
  return requestJson<AuthMeResponse>("/api/auth/me", {
    token
  });
}

export async function getRecentMessages(token: string, limit = 50): Promise<ChatHistoryResponse> {
  return requestJson<ChatHistoryResponse>(`/api/chat/messages?limit=${limit}`, {
    token
  });
}

export async function getTodayQuestion(token: string): Promise<DailyQuestionTodayResponse> {
  return requestJson<DailyQuestionTodayResponse>("/api/daily-question/today", { token });
}

export async function submitTodayAnswer(
  token: string,
  payload: { questionId: number; answerIndex: number }
): Promise<DailyQuestionAnswerResponse> {
  return requestJson<DailyQuestionAnswerResponse>("/api/daily-question/answer", {
    method: "POST",
    token,
    body: JSON.stringify(payload)
  });
}

export async function getQuestionStats(token: string, questionId: number): Promise<{ stats: DailyQuestionStats }> {
  return requestJson<{ stats: DailyQuestionStats }>(`/api/daily-question/stats?questionId=${questionId}`, {
    token
  });
}

export async function getGomokuGames(token: string): Promise<GomokuGamesResponse> {
  return requestJson<GomokuGamesResponse>("/api/gomoku/games", { token });
}

export async function inviteGomoku(token: string, targetUserId: string): Promise<GomokuInviteResponse> {
  return requestJson<GomokuInviteResponse>("/api/gomoku/invite", {
    method: "POST",
    token,
    body: JSON.stringify({ targetUserId })
  });
}

export async function acceptGomoku(token: string, gameId: number): Promise<GomokuInviteResponse> {
  return requestJson<GomokuInviteResponse>("/api/gomoku/accept", {
    method: "POST",
    token,
    body: JSON.stringify({ gameId })
  });
}

export async function moveGomoku(
  token: string,
  payload: { gameId: number; row: number; col: number }
): Promise<GomokuMoveResponse> {
  return requestJson<GomokuMoveResponse>("/api/gomoku/move", {
    method: "POST",
    token,
    body: JSON.stringify(payload)
  });
}
