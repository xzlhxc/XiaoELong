// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../test-setup";
import { render, screen } from "@testing-library/react";
import { useDesktop, type DesktopContextValue } from "../../contexts/DesktopContext";
import { PanelPage } from "./PanelPage";

// ============================================================
// Mock 依赖：DesktopContext / PanelContent / window.xiaoelongDesktop
// ============================================================

vi.mock("../../contexts/DesktopContext", () => ({ useDesktop: vi.fn() }));
vi.mock("./PanelContent", () => ({ PanelContent: () => <div data-testid="panel-content" /> }));

const mockedUseDesktop = vi.mocked(useDesktop);

let notifyPanelReady: ReturnType<typeof vi.fn>;

/** 只 mock PanelPage 用到的 3 个字段，其余用类型断言占位 */
function mockDesktop(overrides: Partial<DesktopContextValue> = {}): void {
  mockedUseDesktop.mockReturnValue({
    panelRevealRequestId: 0,
    panelView: "home",
    activeTab: "chat",
    ...overrides
  } as unknown as DesktopContextValue);
}

beforeEach(() => {
  notifyPanelReady = vi.fn();
  mockDesktop();
  (window as unknown as { xiaoelongDesktop: unknown }).xiaoelongDesktop = { notifyPanelReady };

  // scheduleAfterNextPaint 是双层 rAF，同步执行让回执在 render 后立即触发
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  mockedUseDesktop.mockReset();
  delete (window as unknown as { xiaoelongDesktop?: unknown }).xiaoelongDesktop;
  vi.unstubAllGlobals();
});

// ============================================================
// 正常路径
// ============================================================

describe("PanelPage 正常路径", () => {
  it("panelRevealRequestId > 0 时两帧后调用 notifyPanelReady(id)", () => {
    mockDesktop({ panelRevealRequestId: 7 });
    render(<PanelPage />);
    expect(notifyPanelReady).toHaveBeenCalledTimes(1);
    expect(notifyPanelReady).toHaveBeenCalledWith(7);
  });

  it("渲染 panel 壳并包裹 PanelContent", () => {
    const { container } = render(<PanelPage />);
    expect(container.querySelector(".shell-page")).toBeTruthy();
    expect(container.querySelector(".panel-page")).toBeTruthy();
    expect(screen.getByTestId("panel-content")).toBeTruthy();
  });
});

// ============================================================
// 边界条件
// ============================================================

describe("PanelPage 边界条件", () => {
  it("panelRevealRequestId <= 0 时不调用 notifyPanelReady", () => {
    render(<PanelPage />);
    expect(notifyPanelReady).not.toHaveBeenCalled();
  });

  it("window.xiaoelongDesktop 不存在（浏览器环境）时不崩溃", () => {
    delete (window as unknown as { xiaoelongDesktop?: unknown }).xiaoelongDesktop;
    mockDesktop({ panelRevealRequestId: 3 });
    expect(() => render(<PanelPage />)).not.toThrow();
  });
});

// ============================================================
// 状态转换
// ============================================================

describe("PanelPage 状态转换", () => {
  it("panelRevealRequestId 从 0 变化到 5 后重新触发 notifyPanelReady(5)", () => {
    const { rerender } = render(<PanelPage />);
    expect(notifyPanelReady).not.toHaveBeenCalled();

    mockDesktop({ panelRevealRequestId: 5 });
    rerender(<PanelPage />);

    expect(notifyPanelReady).toHaveBeenCalledTimes(1);
    expect(notifyPanelReady).toHaveBeenCalledWith(5);
  });

  it("panelView 变化重新触发 notifyPanelReady（effect 依赖包含 panelView）", () => {
    mockDesktop({ panelRevealRequestId: 4 });
    const { rerender } = render(<PanelPage />);
    expect(notifyPanelReady).toHaveBeenCalledTimes(1);

    mockDesktop({ panelRevealRequestId: 4, panelView: "settings" });
    rerender(<PanelPage />);

    expect(notifyPanelReady).toHaveBeenCalledTimes(2);
    expect(notifyPanelReady).toHaveBeenLastCalledWith(4);
  });
});
