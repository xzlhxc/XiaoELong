import { createHash } from "node:crypto";
import type { DailyQuestionVisual, MatrixPatternTile } from "@xiaoelong/shared";
import type { QuestionBankImportItem } from "../db/question-bank.js";

const SOURCE_CONTEXT = JSON.stringify({
  source: "raven_style",
  title: "RAVEN 风格程序化图推",
  homepage: "https://github.com/WellyZhang/RAVEN",
  license: "项目内程序化生成",
  note: "受 RAVEN 抽象视觉推理任务启发，不包含原始 RAVEN 数据集文件。"
});

const SHAPES: MatrixPatternTile["shape"][] = [
  "circle",
  "triangle",
  "square",
  "diamond",
  "pentagon",
  "hexagon"
];

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function tile(overrides: Partial<MatrixPatternTile> = {}): MatrixPatternTile {
  return {
    shape: "circle",
    count: 1,
    rotation: 0,
    filled: false,
    position: 4,
    ...overrides
  };
}

function shuffledChoices(
  correct: MatrixPatternTile,
  distractors: MatrixPatternTile[],
  nextRandom: () => number
): { choices: MatrixPatternTile[]; correctAnswerIndex: number } {
  const unique = [correct, ...distractors].filter((candidate, index, items) => (
    items.findIndex((item) => JSON.stringify(item) === JSON.stringify(candidate)) === index
  )).slice(0, 4);
  if (unique.length !== 4) {
    throw new Error("Visual question generator produced duplicate choices.");
  }
  for (let index = unique.length - 1; index > 0; index -= 1) {
    const target = Math.floor(nextRandom() * (index + 1));
    [unique[index], unique[target]] = [unique[target], unique[index]];
  }
  return {
    choices: unique,
    correctAnswerIndex: unique.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(correct))
  };
}

function createCountQuestion(index: number, nextRandom: () => number) {
  const cells: MatrixPatternTile[] = [];
  const pairs = [[1, 1], [1, 2], [2, 1]] as const;
  for (let row = 0; row < 3; row += 1) {
    const shape = SHAPES[(index + row) % SHAPES.length];
    const [first, second] = pairs[(index + row) % pairs.length];
    const common = {
      shape,
      filled: Math.floor(index / 3) % 2 === 1,
      rotation: (Math.floor(index / 6) % 4) * 45
    };
    cells.push(
      tile({ ...common, count: first }),
      tile({ ...common, count: second }),
      tile({ ...common, count: first + second })
    );
  }
  const correct = cells[8];
  const choice = shuffledChoices(correct, [
    tile({ ...correct, count: Math.max(1, correct.count - 1) }),
    tile({ ...correct, count: Math.min(4, correct.count + 1) }),
    tile({ ...correct, shape: SHAPES[(SHAPES.indexOf(correct.shape) + 1) % SHAPES.length] })
  ], nextRandom);
  return {
    cells: [...cells.slice(0, 8), null],
    ...choice,
    explanation: `每一行第三格的图形数量都等于前两格数量之和。第三行前两格分别有 ${cells[6].count} 个和 ${cells[7].count} 个图形，因此问号处应有 ${correct.count} 个相同图形。`
  };
}

function createRotationQuestion(index: number, nextRandom: () => number) {
  const step = [45, 90, 135][index % 3];
  const count = Math.floor(index / 3) % 2 + 1;
  const filled = Math.floor(index / 6) % 2 === 1;
  const cells: MatrixPatternTile[] = [];
  for (let row = 0; row < 3; row += 1) {
    const start = ((index + row) * 45) % 360;
    cells.push(
      tile({ shape: "arrow", rotation: start, filled, count }),
      tile({ shape: "arrow", rotation: (start + step) % 360, filled, count }),
      tile({ shape: "arrow", rotation: (start + step * 2) % 360, filled, count })
    );
  }
  const correct = cells[8];
  const choice = shuffledChoices(correct, [45, 90, 180].map((offset) => (
    tile({ ...correct, rotation: (correct.rotation + offset) % 360 })
  )), nextRandom);
  return {
    cells: [...cells.slice(0, 8), null],
    ...choice,
    explanation: `每一行的箭头从左到右依次顺时针旋转 ${step}°。按同样规律，第三行最后一个箭头应在中间箭头的基础上再顺时针旋转 ${step}°。`
  };
}

function createShapeQuestion(index: number, nextRandom: () => number) {
  const cells: MatrixPatternTile[] = [];
  const count = Math.floor(index / 2) % 3 + 1;
  const step = index % 2 + 1;
  const filled = Math.floor(index / 6) % 2 === 1;
  for (let row = 0; row < 3; row += 1) {
    const start = (index + row) % SHAPES.length;
    cells.push(
      tile({ shape: SHAPES[start], count, filled }),
      tile({ shape: SHAPES[(start + step) % SHAPES.length], count, filled }),
      tile({ shape: SHAPES[(start + step * 2) % SHAPES.length], count, filled })
    );
  }
  const correct = cells[8];
  const correctShapeIndex = SHAPES.indexOf(correct.shape);
  const choice = shuffledChoices(correct, [1, 2, 3].map((offset) => (
    tile({ ...correct, shape: SHAPES[(correctShapeIndex + offset) % SHAPES.length] })
  )), nextRandom);
  return {
    cells: [...cells.slice(0, 8), null],
    ...choice,
    explanation: `每一行的图形都按照相同的形状序列依次向后移动 ${step === 1 ? "一" : "两"} 位，且图形数量保持不变。第三行继续这一顺序即可确定问号处的形状。`
  };
}

function createPositionQuestion(index: number, nextRandom: () => number) {
  const lines = [
    [0, 4, 8],
    [2, 4, 6],
    [1, 4, 7],
    [3, 4, 5]
  ] as const;
  const paths = Array.from({ length: 3 }, (_, row) => {
    const path = [...lines[(index + row) % lines.length]];
    return Math.floor(index / 4) % 2 === 1 ? path.reverse() : path;
  });
  const cells = paths.flatMap((path, row) => path.map((position) => tile({
    shape: SHAPES[(index + row) % 3],
    position,
    filled: row % 2 === 0
  })));
  const correct = cells[8];
  const choice = shuffledChoices(correct, [0, 1, 2, 3, 5, 6, 7, 8]
    .filter((position) => position !== correct.position)
    .slice(0, 3)
    .map((position) => tile({ ...correct, position })), nextRandom);
  return {
    cells: [...cells.slice(0, 8), null],
    ...choice,
    explanation: "每一行的图形都沿一条直线从第一位置移动到中心，再以相同方向移动到关于中心对称的位置。第三行继续这一移动规律即可确定问号处的位置。"
  };
}

export function createVisualQuestionBankItems(count = 120): QuestionBankImportItem[] {
  return Array.from({ length: count }, (_, index) => {
    const nextRandom = random(0x58454c00 + index);
    const variant = Math.floor(index / 4);
    const generated = index % 4 === 0
      ? createCountQuestion(variant, nextRandom)
      : index % 4 === 1
        ? createRotationQuestion(variant, nextRandom)
        : index % 4 === 2
          ? createShapeQuestion(variant, nextRandom)
          : createPositionQuestion(variant, nextRandom);
    const visual: DailyQuestionVisual = {
      type: "matrixPattern",
      data: {
        cells: generated.cells,
        choices: generated.choices
      }
    };
    const content = {
      passage: null,
      question: "请观察图形矩阵的规律，选择问号处最合适的图形。",
      options: ["图形 A", "图形 B", "图形 C", "图形 D"],
      visual,
      correctAnswerIndex: generated.correctAnswerIndex
    };
    return {
      source: "raven_style",
      sourceQuestionId: `generated:${index + 1}`,
      category: "图形推理",
      ...content,
      contentHash: createHash("sha256").update(JSON.stringify(content)).digest("hex"),
      sourceContext: SOURCE_CONTEXT,
      explanation: generated.explanation,
      explanationModel: "deterministic-rule-v1"
    };
  });
}
