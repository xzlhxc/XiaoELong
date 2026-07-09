import type { QuestionGenerateInput, QuestionGenerateOutput, QuestionGeneratorProvider } from "./provider.js";

const FALLBACK_QUESTIONS: Array<Omit<QuestionGenerateOutput, "sourceContext">> = [
  {
    category: "语文常识",
    question: "下列哪位不是“唐宋八大家”？",
    options: ["韩愈", "柳宗元", "李白", "苏轼"],
    visual: null,
    correctAnswerIndex: 2,
    explanation: "唐宋八大家是韩愈、柳宗元、欧阳修、苏洵、苏轼、苏辙、王安石、曾巩，李白不在其中。"
  },
  {
    category: "语文常识",
    question: "成语“不刊之论”中的“刊”，最接近下面哪个意思？",
    options: ["刊登", "删除、修改", "印刷成册", "广泛传播"],
    visual: null,
    correctAnswerIndex: 1,
    explanation: "“不刊之论”指不可改动或不可磨灭的言论，“刊”在这里是削除、修改的意思。"
  },
  {
    category: "语文常识",
    question: "下列哪一句中的“而”更接近转折或对比关系？",
    options: ["学而时习之", "敏而好学", "青，取之于蓝，而青于蓝", "择其善者而从之"],
    visual: null,
    correctAnswerIndex: 2,
    explanation: "“青，取之于蓝，而青于蓝”中的“而”表示前后对比，可理解为“却、但是”。"
  },
  {
    category: "语文常识",
    question: "《岳阳楼记》《醉翁亭记》《小石潭记》都属于古代散文中的哪类文体？",
    options: ["赋", "记", "铭", "表"],
    visual: null,
    correctAnswerIndex: 1,
    explanation: "这三篇标题中都有“记”，属于以记事、写景、抒怀为主的“记”体散文。"
  },
  {
    category: "逻辑推理",
    question: "甲、乙、丙三人中只有一人总说真话。甲说“乙说假话”，乙说“丙说假话”，丙说“甲和乙说的话不一样”。谁总说真话？",
    options: ["甲", "乙", "丙", "无法确定"],
    visual: null,
    correctAnswerIndex: 1,
    explanation: "若乙真，则丙假、甲也假，正好只有乙一人说真话，条件成立。"
  },
  {
    category: "逻辑推理",
    question: "三个盒子标签全贴错，分别写“苹果”“橙子”“苹果和橙子”。只能从一个盒子取一个水果，应取哪个盒子才能确定全部内容？",
    options: ["苹果", "橙子", "苹果和橙子", "任意一个"],
    visual: null,
    correctAnswerIndex: 2,
    explanation: "贴“苹果和橙子”的盒子必然不是混装，取出一个水果后可确定它，再反推另外两个。"
  },
  {
    category: "逻辑推理",
    question: "已知每人职业不同，且表中“×”表示不可能。根据图中信息，谁是医生？",
    options: ["甲", "乙", "丙", "无法确定"],
    visual: {
      type: "logicTable",
      data: {
        people: ["甲", "乙", "丙"],
        roles: ["医生", "教师", "律师"],
        marks: [
          { person: "甲", role: "医生", value: false },
          { person: "乙", role: "医生", value: false },
          { person: "乙", role: "教师", value: false },
          { person: "丙", role: "律师", value: false }
        ]
      }
    },
    correctAnswerIndex: 2,
    explanation: "甲不是医生，乙也不是医生，所以医生只能是丙。"
  },
  {
    category: "逻辑推理",
    question: "根据图中集合信息，参与统计的总人数是多少？",
    options: ["15", "18", "21", "24"],
    visual: {
      type: "venn2",
      data: {
        leftLabel: "会游泳",
        rightLabel: "会骑车",
        leftOnly: 4,
        both: 6,
        rightOnly: 5,
        outside: 3
      }
    },
    correctAnswerIndex: 1,
    explanation: "总人数为只会游泳 4、都会 6、只会骑车 5、都不会 3，相加为 18。"
  },
  {
    category: "数学",
    question: "一个正整数除以 3 余 2，除以 5 余 4，除以 7 余 6。它最小可能是多少？",
    options: ["34", "69", "104", "209"],
    visual: null,
    correctAnswerIndex: 2,
    explanation: "这个数加 1 能同时被 3、5、7 整除，最小为 105，所以原数是 104。"
  },
  {
    category: "数学推理",
    question: "从图中 A 到 B，只能向右或向下走，一共有多少条最短路线？",
    options: ["4", "6", "8", "9"],
    visual: {
      type: "pathGrid",
      data: {
        rows: 3,
        cols: 3,
        start: [0, 0],
        end: [2, 2],
        allowedMoves: ["right", "down"]
      }
    },
    correctAnswerIndex: 1,
    explanation: "最短路线需要 2 次向右和 2 次向下，共有 C(4,2)=6 种排列。"
  },
  {
    category: "数学推理",
    question: "图中四人的得分分别为甲 12、乙 18、丙 15、丁 9。平均数是多少？",
    options: ["12", "13.5", "14", "15"],
    visual: {
      type: "barChart",
      data: {
        title: "四人得分",
        items: [
          { label: "甲", value: 12 },
          { label: "乙", value: 18 },
          { label: "丙", value: 15 },
          { label: "丁", value: 9 }
        ]
      }
    },
    correctAnswerIndex: 1,
    explanation: "平均数为 (12+18+15+9)÷4=13.5。"
  },
  {
    category: "科学常识",
    question: "高山上水更容易沸腾，但煮饭反而更不容易熟，主要原因是什么？",
    options: ["水分子变重", "沸点降低", "锅的导热性变差", "空气温度更高"],
    visual: null,
    correctAnswerIndex: 1,
    explanation: "高海拔气压低，水在较低温度就沸腾，沸水温度不够高，所以食物更难熟。"
  },
  {
    category: "科学常识",
    question: "做对照实验时，除研究变量外，其他条件尽量保持一致，主要是为了什么？",
    options: ["增加样本数量", "排除混杂因素", "让结果更随机", "提高实验温度"],
    visual: null,
    correctAnswerIndex: 1,
    explanation: "控制其他条件可以减少混杂因素影响，使结果更能反映研究变量的作用。"
  },
  {
    category: "历史地理",
    question: "《梦溪笔谈》通常被认为是哪位北宋学者的代表性著作？",
    options: ["沈括", "苏轼", "王安石", "司马光"],
    visual: null,
    correctAnswerIndex: 0,
    explanation: "《梦溪笔谈》是北宋沈括的综合性笔记体著作，涉及科技、历史、制度等内容。"
  },
  {
    category: "历史地理",
    question: "都江堰水利工程通常与下列哪位历史人物相关？",
    options: ["商鞅", "李冰", "张衡", "祖冲之"],
    visual: null,
    correctAnswerIndex: 1,
    explanation: "都江堰由战国时期秦国蜀郡太守李冰父子主持修建，至今仍有重要影响。"
  },
  {
    category: "轻量 Puzzle",
    question: "数列 1、2、4、7、11、16、？ 中问号处应填什么？",
    options: ["20", "21", "22", "23"],
    visual: null,
    correctAnswerIndex: 2,
    explanation: "相邻差值为 1、2、3、4、5，下一个差值是 6，所以 16+6=22。"
  },
  {
    category: "几何推理",
    question: "图中 AB = AC，且 ∠A = 40°。∠B 是多少？",
    options: ["40°", "60°", "70°", "80°"],
    visual: {
      type: "triangle",
      data: {
        points: ["A", "B", "C"],
        equalSides: [
          ["A", "B"],
          ["A", "C"]
        ],
        angles: [{ point: "A", degrees: 40 }],
        unknownAngleAt: "B"
      }
    },
    correctAnswerIndex: 2,
    explanation: "等腰三角形底角相等，∠B=∠C=(180°-40°)÷2=70°。"
  },
  {
    category: "轻量 Puzzle",
    question: "图中钟表显示 3:30，此时时针与分针的较小夹角是多少？",
    options: ["60°", "75°", "90°", "105°"],
    visual: {
      type: "clock",
      data: {
        hour: 3,
        minute: 30
      }
    },
    correctAnswerIndex: 1,
    explanation: "3:30 时分针在 180°，时针在 105°，较小夹角是 75°。"
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
