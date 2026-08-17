export const COLOR_THEME_OPTIONS = [
  {
    id: "melonStone",
    name: "奶蜜浅石",
    description: "奶蜜瓜绿 × 浅石青",
    swatches: ["#A9D8B7", "#7BBFCF", "#E7F5EB", "#4E8177"]
  },
  {
    id: "lemonMist",
    name: "柔柠雾霾",
    description: "柔柠黄 × 雾霾蓝",
    swatches: ["#F9D77C", "#8DA6D2", "#FFF5D6", "#586B91"]
  },
  {
    id: "peachIndigo",
    name: "雾桃柔靛",
    description: "雾桃粉 × 柔靛青",
    swatches: ["#F2B6B6", "#6A90A6", "#FCE8E8", "#4F7185"]
  },
  {
    id: "orangePurple",
    name: "柔橙烟雾",
    description: "柔橙粉 × 烟雾紫",
    swatches: ["#F5B89E", "#B8A6D3", "#FCE9E1", "#796B91"]
  },
  {
    id: "creamGray",
    name: "浅奶柔灰",
    description: "浅奶黄 × 柔炭灰",
    swatches: ["#FBE2A2", "#8C8C94", "#FFF4D4", "#62636B"]
  }
] as const;

export type ColorTheme = (typeof COLOR_THEME_OPTIONS)[number]["id"];

const COLOR_THEME_IDS = new Set<string>(COLOR_THEME_OPTIONS.map((theme) => theme.id));

export function normalizeColorTheme(value: unknown): ColorTheme {
  return typeof value === "string" && COLOR_THEME_IDS.has(value)
    ? (value as ColorTheme)
    : "melonStone";
}
