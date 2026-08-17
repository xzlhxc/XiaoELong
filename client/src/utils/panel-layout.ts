export type PanelLayout = "classic" | "guo";

export function normalizePanelLayout(value: unknown): PanelLayout {
  return value === "guo" ? "guo" : "classic";
}
