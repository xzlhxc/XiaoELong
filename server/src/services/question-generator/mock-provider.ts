import type { QuestionGenerateInput, QuestionGenerateOutput, QuestionGeneratorProvider } from "./provider.js";

const FALLBACK_QUESTIONS: Array<Omit<QuestionGenerateOutput, "sourceContext">> = [
  {
    category: "语文常识",
    question: "下列哪一句中的“而”表示转折关系？",
    options: ["学而时习之", "青，取之于蓝，而青于蓝", "敏而好学", "择其善者而从之"],
    correctAnswerIndex: 1,
    explanation: "“青，取之于蓝，而青于蓝”中的“而”可理解为“却、但是”，表示转折或递进对比。"
  },
  {
    category: "数学",
    question: "一个数的 20% 是 18，这个数是多少？",
    options: ["72", "80", "90", "108"],
    correctAnswerIndex: 2,
    explanation: "设这个数为 x，则 20% x = 18，所以 x = 18 / 0.2 = 90。"
  },
  {
    category: "科学",
    question: "人看到物体，是因为物体发出或反射的光进入了人体的哪个部位？",
    options: ["耳朵", "眼睛", "鼻子", "皮肤"],
    correctAnswerIndex: 1,
    explanation: "视觉形成的第一步是光线进入眼睛，再由视觉系统处理。"
  },
  {
    category: "历史地理",
    question: "中国古代“丝绸之路”最初主要连接中国和哪个方向的地区？",
    options: ["东亚海岛", "中亚及更西方地区", "南极地区", "北美大陆"],
    correctAnswerIndex: 1,
    explanation: "陆上丝绸之路从中国通向中亚、西亚，并进一步连接欧洲等地区。"
  },
  {
    category: "脑筋急转弯",
    question: "什么东西越洗越脏？",
    options: ["毛巾", "水", "肥皂", "脸盆"],
    correctAnswerIndex: 1,
    explanation: "这是一道脑筋急转弯：水用来洗东西时会带走污渍，所以水本身会变脏。"
  },
  {
    category: "轻量 Puzzle",
    question: "数列 2、4、8、16、？ 中问号处应该填什么？",
    options: ["20", "24", "30", "32"],
    correctAnswerIndex: 3,
    explanation: "每一项都是前一项乘以 2，因此 16 后面是 32。"
  },
  {
    category: "生活常识",
    question: "下列哪种做法更有助于保护牙齿？",
    options: ["睡前刷牙", "用牙齿开瓶盖", "饭后立刻大量吃糖", "长期不换牙刷"],
    correctAnswerIndex: 0,
    explanation: "睡前刷牙能减少口腔中的食物残渣和细菌，更有助于保护牙齿。"
  },
  {
    category: "逻辑推理",
    question: "如果所有 A 都是 B，所有 B 都是 C，那么一定可以推出什么？",
    options: ["所有 C 都是 A", "所有 A 都是 C", "有些 C 不是 B", "所有 B 都不是 A"],
    correctAnswerIndex: 1,
    explanation: "A 属于 B，B 又属于 C，因此 A 一定属于 C。"
  }
];

function hashDate(date: string): number {
  return Array.from(date).reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function normalizeQuestion(question: string): string {
  return question.replace(/\s+/g, "").trim();
}

export class MockQuestionGeneratorProvider implements QuestionGeneratorProvider {
  async generate(input: QuestionGenerateInput): Promise<QuestionGenerateOutput> {
    const startIndex = hashDate(input.date) % FALLBACK_QUESTIONS.length;
    const avoided = new Set((input.avoidQuestions ?? []).map(normalizeQuestion));
    let question = FALLBACK_QUESTIONS[startIndex];
    for (let offset = 0; offset < FALLBACK_QUESTIONS.length; offset += 1) {
      const candidate = FALLBACK_QUESTIONS[(startIndex + offset) % FALLBACK_QUESTIONS.length];
      if (!avoided.has(normalizeQuestion(candidate.question))) {
        question = candidate;
        break;
      }
    }
    return {
      ...question,
      sourceContext: JSON.stringify({
        provider: "local-fallback",
        date: input.date
      })
    };
  }
}
