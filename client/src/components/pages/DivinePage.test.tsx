// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../test-setup";
import { fireEvent, render } from "@testing-library/react";
import { useDeity, type DeityContextValue } from "../../contexts/DeityContext";
import { DivinePage } from "./DivinePage";

// ============================================================
// Mock 依赖：DeityContext / FullScreenDivineSelection（子组件）
// ============================================================

vi.mock("../../contexts/DeityContext", () => ({ useDeity: vi.fn() }));
vi.mock("../panels/DivineSelectionPanel", () => ({
  FullScreenDivineSelection: ({ onClose }: { onClose: (completed: boolean) => void }) => (
    <div data-testid="fullscreen-divine" onClick={() => onClose(true)} />
  )
}));

const mockedUseDeity = vi.mocked(useDeity);

let closeDivineSelection: ReturnType<typeof vi.fn>;

beforeEach(() => {
  closeDivineSelection = vi.fn();
  mockedUseDeity.mockReturnValue({ divineViewSession: 3 } as unknown as DeityContextValue);
  (window as unknown as { xiaoelongDesktop: unknown }).xiaoelongDesktop = { closeDivineSelection };
});

afterEach(() => {
  mockedUseDeity.mockReset();
  delete (window as unknown as { xiaoelongDesktop?: unknown }).xiaoelongDesktop;
});

describe("DivinePage", () => {
  it("渲染 FullScreenDivineSelection", () => {
    const { container } = render(<DivinePage />);
    expect(container.querySelector("[data-testid=fullscreen-divine]")).toBeTruthy();
  });

  it("神选完成时通过 onClose 回执 closeDivineSelection(completed)", () => {
    render(<DivinePage />);
    fireEvent.click(document.querySelector("[data-testid=fullscreen-divine]") as HTMLElement);
    expect(closeDivineSelection).toHaveBeenCalledWith(true);
  });
});
