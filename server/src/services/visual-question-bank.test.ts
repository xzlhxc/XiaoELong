// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createVisualQuestionBankItems } from "./visual-question-bank.js";

describe("createVisualQuestionBankItems", () => {
  it("creates 120 deterministic and unique matrix questions", () => {
    const first = createVisualQuestionBankItems();
    const second = createVisualQuestionBankItems();

    expect(first).toEqual(second);
    expect(first).toHaveLength(120);
    expect(new Set(first.map((item) => item.sourceQuestionId)).size).toBe(120);
    expect(new Set(first.map((item) => item.contentHash)).size).toBe(120);
  });

  it("provides four unique choices and a valid answer for every question", () => {
    for (const item of createVisualQuestionBankItems()) {
      expect(item.visual?.type).toBe("matrixPattern");
      if (item.visual?.type !== "matrixPattern") {
        continue;
      }
      expect(item.visual.data.cells).toHaveLength(9);
      expect(item.visual.data.cells[8]).toBeNull();
      expect(item.visual.data.choices).toHaveLength(4);
      expect(new Set(item.visual.data.choices.map((choice) => JSON.stringify(choice))).size).toBe(4);
      expect(item.correctAnswerIndex).toBeGreaterThanOrEqual(0);
      expect(item.correctAnswerIndex).toBeLessThan(4);
      expect(item.explanation?.trim().length).toBeGreaterThan(0);
    }
  });
});
