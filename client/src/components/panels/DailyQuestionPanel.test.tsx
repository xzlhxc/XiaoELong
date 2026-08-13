// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../test-setup";
import { render, screen } from "@testing-library/react";
import type { DailyQuestionTodayResponse } from "@xiaoelong/shared";
import { useDaily, type DailyContextValue } from "../../contexts/DailyContext";
import { DailyQuestionPanel } from "./DailyQuestionPanel";

vi.mock("../../contexts/DailyContext", () => ({ useDaily: vi.fn() }));
vi.mock("../atoms/UserAvatar", () => ({
  UserAvatar: () => <span data-testid="user-avatar" />
}));

const mockedUseDaily = vi.mocked(useDaily);

function makeDailyData(): DailyQuestionTodayResponse {
  return {
    question: {
      id: 1,
      date: "2026-08-13",
      category: "逻辑",
      question: "刷新时仍应显示这道题",
      options: ["是", "否"],
      visual: null,
      sourceType: "manual",
      sourceContext: null,
      createdAt: "2026-08-13T00:00:00.000Z"
    },
    stats: {
      questionId: 1,
      counts: [0, 0],
      totalAnswers: 0,
      voters: [[], []]
    },
    answeredIndex: null,
    result: null
  };
}

function mockDaily(overrides: Partial<DailyContextValue> = {}): void {
  mockedUseDaily.mockReturnValue({
    dailyData: makeDailyData(),
    dailyLoading: false,
    dailyError: null,
    moodStatus: null,
    moodLoading: false,
    moodOptions: [],
    answerDaily: vi.fn(),
    selectMood: vi.fn(),
    refreshDaily: vi.fn().mockResolvedValue(undefined),
    clear: vi.fn(),
    ...overrides
  } as DailyContextValue);
}

afterEach(() => {
  mockedUseDaily.mockReset();
});

describe("DailyQuestionPanel 刷新状态", () => {
  it("刷新时保留已有题目，并在刷新按钮左侧显示状态", () => {
    mockDaily({ dailyLoading: true });
    const { container } = render(<DailyQuestionPanel />);

    expect(screen.getByText("刷新时仍应显示这道题")).toBeTruthy();
    expect(screen.getByText("刷新中")).toBeTruthy();
    expect((screen.getByRole("button", { name: "刷新" }) as HTMLButtonElement).disabled).toBe(true);

    const actions = container.querySelector(".daily-actions");
    expect(actions?.children[0].classList.contains("module-refresh-status")).toBe(true);
    expect(actions?.children[1].textContent).toBe("刷新");
  });

  it("初次加载无数据时仍保留标题、状态和刷新按钮的位置", () => {
    mockDaily({ dailyData: null, dailyLoading: true });
    render(<DailyQuestionPanel />);

    expect(screen.getByRole("heading", { name: "每日一题" })).toBeTruthy();
    expect(screen.getByText("正在加载题目...")).toBeTruthy();
    expect(screen.getByText("刷新中")).toBeTruthy();
    expect((screen.getByRole("button", { name: "刷新" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
