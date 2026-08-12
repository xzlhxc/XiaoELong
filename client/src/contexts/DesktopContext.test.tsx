// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import "../test-setup";
import { renderHook, screen, render, act } from "@testing-library/react";
import {
  createInitialState,
  desktopReducer,
  DesktopProvider,
  useDesktop,
  type DesktopAction,
  type DesktopState
} from "./DesktopContext";

// ============================================================
// reducer 单元测试
// ============================================================

function makeState(overrides?: Partial<DesktopState>): DesktopState {
  return { ...createInitialState(), ...overrides };
}

describe("desktopReducer", () => {
  // 1. 正常路径：打开/关闭面板
  it("SET_PANEL_OPEN 切换面板开关状态", () => {
    const state = makeState({ panelOpen: false });
    const action: DesktopAction = { type: "SET_PANEL_OPEN", payload: true };
    const next = desktopReducer(state, action);
    expect(next.panelOpen).toBe(true);
    // 其他状态不变
    expect(next.activeTab).toBe(state.activeTab);
  });

  // 2. 正常路径：切换标签页
  it("SET_ACTIVE_TAB 切换到指定标签", () => {
    const state = makeState({ activeTab: "chat" });
    const action: DesktopAction = { type: "SET_ACTIVE_TAB", payload: "gomoku" };
    const next = desktopReducer(state, action);
    expect(next.activeTab).toBe("gomoku");
  });

  // 3. 正常路径：切换面板视图
  it("SET_PANEL_VIEW 切换 home 和 settings 视图", () => {
    const home = makeState({ panelView: "home" });
    const action: DesktopAction = { type: "SET_PANEL_VIEW", payload: "settings" };
    expect(desktopReducer(home, action).panelView).toBe("settings");
  });

  // 4. 正常路径：更新桌面设置
  it("SET_DESKTOP_SETTINGS 完整替换设置对象", () => {
    const state = makeState({
      desktopSettings: {
        openAtLogin: false,
        panelAlwaysOnTop: true,
        petDisplayMode: "dynamic",
        petAnimationsEnabled: true,
        petDisplayModePersisted: true
      }
    });
    const newSettings = { ...state.desktopSettings, openAtLogin: true };
    const action: DesktopAction = { type: "SET_DESKTOP_SETTINGS", payload: newSettings };
    expect(desktopReducer(state, action).desktopSettings.openAtLogin).toBe(true);
  });

  // 5. 正常路径：设置桌宠反应
  it("SET_PET_REACTION 设置桌宠反应动画", () => {
    const state = makeState({ petReaction: null });
    const reaction = { gameId: 1, kind: "victory" as const };
    const action: DesktopAction = { type: "SET_PET_REACTION", payload: reaction };
    expect(desktopReducer(state, action).petReaction).toEqual(reaction);
  });

  // 6. 正常路径：清除桌宠反应
  it("CLEAR_PET_REACTION 将 petReaction 重置为 null", () => {
    const state = makeState({ petReaction: { gameId: 1, kind: "defeat" as const } });
    const action: DesktopAction = { type: "CLEAR_PET_REACTION" };
    expect(desktopReducer(state, action).petReaction).toBeNull();
  });

  // 7. 状态转换：登出清理
  it("CLEAR 重置面板/弹窗状态但不影响桌面角色", () => {
    const state = makeState({
      desktopRole: "single",
      panelOpen: true,
      panelView: "settings",
      deleteConfirmOpen: true,
      detailsOpen: true,
      activeTab: "gomoku"
    });
    const next = desktopReducer(state, { type: "CLEAR" });
    expect(next.panelOpen).toBe(false);
    expect(next.panelView).toBe("home");
    expect(next.deleteConfirmOpen).toBe(false);
    expect(next.detailsOpen).toBe(false);
    // CLEAR 不重置的角色状态
    expect(next.desktopRole).toBe("single");
    expect(next.activeTab).toBe("gomoku");
  });

  // 8. 边界条件：未知 action type
  it("未知 action type 返回原 state（不崩溃）", () => {
    const state = makeState();
    const action = { type: "UNKNOWN_ACTION" } as unknown as DesktopAction;
    expect(desktopReducer(state, action)).toBe(state);
  });

  // 9. 边界条件：null 值
  it("SET_PET_REACTION 接受 null 清除反应", () => {
    const state = makeState({ petReaction: { gameId: 42, kind: "draw" as const } });
    const action: DesktopAction = { type: "SET_PET_REACTION", payload: null };
    expect(desktopReducer(state, action).petReaction).toBeNull();
  });

  // 10. 正常路径：设置确认弹窗
  it("SET_DELETE_CONFIRM_OPEN 控制注销确认弹窗", () => {
    const state = makeState({ deleteConfirmOpen: false });
    const action: DesktopAction = { type: "SET_DELETE_CONFIRM_OPEN", payload: true };
    expect(desktopReducer(state, action).deleteConfirmOpen).toBe(true);
  });

  // 11. 正常路径：设置面板请求 ID
  it("SET_PANEL_REVEAL_REQUEST_ID 更新 Electron 面板请求 ID", () => {
    const state = makeState({ panelRevealRequestId: 0 });
    const action: DesktopAction = { type: "SET_PANEL_REVEAL_REQUEST_ID", payload: 42 };
    expect(desktopReducer(state, action).panelRevealRequestId).toBe(42);
  });

  // 12. 状态转换：更新状态机
  it("SET_UPDATE_STATE 更新自动更新状态", () => {
    const state = makeState({
      updateState: { status: "idle", message: "", version: "0.0.0", progress: null, manual: false }
    });
    const newUpdate = { status: "checking" as const, message: "检查中…", version: "1.0.0", progress: null, manual: true };
    const action: DesktopAction = { type: "SET_UPDATE_STATE", payload: newUpdate };
    expect(desktopReducer(state, action).updateState).toEqual(newUpdate);
  });

  // 13. reducer 不修改原 state（不可变性）
  it("reducer 返回新对象，不修改原 state", () => {
    const state = makeState({ panelOpen: false });
    const action: DesktopAction = { type: "SET_PANEL_OPEN", payload: true };
    const next = desktopReducer(state, action);
    expect(next).not.toBe(state);
    expect(state.panelOpen).toBe(false); // 原 state 未变
  });
});

// ============================================================
// Context / Provider 集成测试
// ============================================================

describe("DesktopProvider & useDesktop", () => {
  // 14. 错误路径：Provider 外调用 hook
  it("useDesktop 在 DesktopProvider 外抛出错误", () => {
    expect(() => renderHook(() => useDesktop())).toThrow(
      "useDesktop must be used within DesktopProvider"
    );
  });

  // 15. 正常路径：Provider 渲染子组件
  it("DesktopProvider 正常渲染子组件", () => {
    render(
      <DesktopProvider>
        <div data-testid="child">hello</div>
      </DesktopProvider>
    );
    expect(screen.getByTestId("child").textContent).toBe("hello");
  });

  // 16. 正常路径：isDesktop 派生值正确
  it("single 角色时 isDesktop 为 false", () => {
    // single 角色（浏览器模式）
    const { result } = renderHook(() => useDesktop(), {
      wrapper: DesktopProvider
    });
    // 注意：在 jsdom 环境中，window.xiaoelongDesktop 不存在，
    // 所以 getDesktopRole() 返回 "single"
    expect(result.current.desktopRole).toBe("single");
    expect(result.current.isDesktop).toBe(false);
  });

  // 17. 正常路径：可以调用 handler 修改状态
  it("setActiveTab 修改 activeTab 状态", () => {
    const { result } = renderHook(() => useDesktop(), {
      wrapper: DesktopProvider
    });
    expect(result.current.activeTab).toBe("chat"); // 初始值
    act(() => {
      result.current.setActiveTab("daily");
    });
    expect(result.current.activeTab).toBe("daily");
  });

  // 18. 边界：togglePanel 在非 Electron 环境切换 panelOpen
  it("togglePanel 在浏览器环境切换 panelOpen", () => {
    const { result } = renderHook(() => useDesktop(), {
      wrapper: DesktopProvider
    });
    expect(result.current.panelOpen).toBe(false);
    act(() => {
      result.current.togglePanel();
    });
    expect(result.current.panelOpen).toBe(true);
    act(() => {
      result.current.togglePanel();
    });
    expect(result.current.panelOpen).toBe(false);
  });
});
