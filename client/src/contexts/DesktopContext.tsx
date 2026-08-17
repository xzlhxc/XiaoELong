import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import {
  getNextPetDisplayMode,
  normalizePetDisplayMode,
  type PetDisplayMode,
  type PetReaction
} from "../utils/pet-animation";
import { normalizeColorTheme, type ColorTheme } from "../utils/color-theme";
import { normalizePanelLayout, type PanelLayout } from "../utils/panel-layout";

// ============================================================
// 常量
// ============================================================

const PET_DISPLAY_MODE_STORAGE_KEY = "xiaoelong_pet_display_mode";
const PET_ANIMATIONS_STORAGE_KEY = "xiaoelong_pet_animations_enabled";
const COLOR_THEME_STORAGE_KEY = "xiaoelong_color_theme";
const PANEL_LAYOUT_STORAGE_KEY = "xiaoelong_panel_layout";

// ============================================================
// 类型定义
// ============================================================

export type ModuleTab = "chat" | "daily" | "divine" | "gomoku";
export type DesktopRole = "auth" | "avatar" | "panel" | "divine" | "single";
export type PanelView = "home" | "settings";

export interface DesktopSettingsState {
  openAtLogin: boolean;
  panelAlwaysOnTop: boolean;
  colorTheme: ColorTheme;
  panelLayout: PanelLayout;
  petDisplayMode: PetDisplayMode;
  petAnimationsEnabled: boolean;
  petDisplayModePersisted: boolean;
}

export interface DesktopState {
  desktopRole: DesktopRole;
  panelOpen: boolean;
  activeTab: ModuleTab;
  panelView: PanelView;
  panelRevealRequestId: number;
  deleteConfirmOpen: boolean;
  detailsOpen: boolean;
  desktopSettings: DesktopSettingsState;
  updateState: XiaoELongUpdateState;
  petReaction: PetReaction | null;
}

// ============================================================
// Action 类型
// ============================================================

export type DesktopAction =
  | { type: "SET_PANEL_OPEN"; payload: boolean }
  | { type: "SET_ACTIVE_TAB"; payload: ModuleTab }
  | { type: "SET_PANEL_VIEW"; payload: PanelView }
  | { type: "SET_PANEL_REVEAL_REQUEST_ID"; payload: number }
  | { type: "SET_DELETE_CONFIRM_OPEN"; payload: boolean }
  | { type: "SET_DETAILS_OPEN"; payload: boolean }
  | { type: "SET_DESKTOP_SETTINGS"; payload: DesktopSettingsState }
  | { type: "SET_UPDATE_STATE"; payload: XiaoELongUpdateState }
  | { type: "SET_PET_REACTION"; payload: PetReaction | null }
  | { type: "CLEAR_PET_REACTION" }
  | { type: "CLEAR" };

// ============================================================
// 模块级辅助函数
// ============================================================

interface InitialPetDisplayPreference {
  mode: PetDisplayMode;
  persisted: boolean;
}

function getInitialPetDisplayPreference(): InitialPetDisplayPreference {
  const storedMode = localStorage.getItem(PET_DISPLAY_MODE_STORAGE_KEY);
  const legacyValue = localStorage.getItem(PET_ANIMATIONS_STORAGE_KEY);
  const legacyAnimationsEnabled =
    legacyValue === "true" ? true : legacyValue === "false" ? false : undefined;
  return {
    mode: normalizePetDisplayMode(storedMode, legacyAnimationsEnabled),
    persisted: storedMode !== null || legacyAnimationsEnabled !== undefined
  };
}

function getDesktopRole(): DesktopRole {
  if (!window.xiaoelongDesktop?.isDesktop) {
    return "single";
  }

  const role =
    window.xiaoelongDesktop.role ??
    new URLSearchParams(window.location.search).get("desktopRole");
  return role === "auth" || role === "avatar" || role === "panel" || role === "divine"
    ? role
    : "auth";
}

interface InitialPanelSession {
  requestId: number;
  view: PanelView;
}

function getInitialPanelSession(): InitialPanelSession {
  const view = new URLSearchParams(window.location.search).get("desktopPanelView");
  const fallback: InitialPanelSession = {
    requestId: 0,
    view: view === "settings" ? "settings" : "home"
  };
  if (window.xiaoelongDesktop?.role !== "panel") {
    return fallback;
  }
  return window.xiaoelongDesktop.getInitialPanelSession?.() ?? fallback;
}

// ============================================================
// 模块级初始值
// ============================================================

const INITIAL_PANEL_SESSION = getInitialPanelSession();
const INITIAL_PET_DISPLAY_PREFERENCE = getInitialPetDisplayPreference();
const INITIAL_PET_DISPLAY_MODE = INITIAL_PET_DISPLAY_PREFERENCE.mode;

export function createInitialState(): DesktopState {
  return {
    desktopRole: getDesktopRole(),
    panelOpen: false,
    activeTab: "chat",
    panelView: INITIAL_PANEL_SESSION.view,
    panelRevealRequestId: INITIAL_PANEL_SESSION.requestId,
    deleteConfirmOpen: false,
    detailsOpen: false,
    desktopSettings: {
      openAtLogin: false,
      panelAlwaysOnTop: true,
      colorTheme: normalizeColorTheme(localStorage.getItem(COLOR_THEME_STORAGE_KEY)),
      panelLayout: normalizePanelLayout(localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY)),
      petDisplayMode: INITIAL_PET_DISPLAY_MODE,
      petAnimationsEnabled: INITIAL_PET_DISPLAY_MODE === "dynamic",
      petDisplayModePersisted: INITIAL_PET_DISPLAY_PREFERENCE.persisted
    },
    updateState: {
      status: "idle",
      message: "",
      version: "0.0.0",
      progress: null,
      manual: false
    },
    petReaction: null
  };
}

// ============================================================
// Reducer
// ============================================================

export function desktopReducer(state: DesktopState, action: DesktopAction): DesktopState {
  switch (action.type) {
    case "SET_PANEL_OPEN":
      return { ...state, panelOpen: action.payload };

    case "SET_ACTIVE_TAB":
      return { ...state, activeTab: action.payload };

    case "SET_PANEL_VIEW":
      return { ...state, panelView: action.payload };

    case "SET_PANEL_REVEAL_REQUEST_ID":
      return { ...state, panelRevealRequestId: action.payload };

    case "SET_DELETE_CONFIRM_OPEN":
      return { ...state, deleteConfirmOpen: action.payload };

    case "SET_DETAILS_OPEN":
      return { ...state, detailsOpen: action.payload };

    case "SET_DESKTOP_SETTINGS":
      return { ...state, desktopSettings: action.payload };

    case "SET_UPDATE_STATE":
      return { ...state, updateState: action.payload };

    case "SET_PET_REACTION":
      return { ...state, petReaction: action.payload };

    case "CLEAR_PET_REACTION":
      return { ...state, petReaction: null };

    case "CLEAR":
      return {
        ...state,
        panelOpen: false,
        panelView: "home",
        deleteConfirmOpen: false,
        detailsOpen: false
      };

    default:
      return state;
  }
}

// ============================================================
// Context
// ============================================================

export interface DesktopContextValue extends DesktopState {
  isDesktop: boolean;
  setActiveTab: (tab: ModuleTab) => void;
  togglePanel: () => void;
  openSettings: () => void;
  setPetReaction: (reaction: PetReaction | null) => void;
  setDeleteConfirmOpen: (open: boolean) => void;
  setDetailsOpen: (open: boolean) => void;
  toggleLoginAtStartup: () => Promise<void>;
  togglePanelTopmost: () => Promise<void>;
  setColorTheme: (theme: ColorTheme) => Promise<void>;
  setPanelLayout: (layout: PanelLayout) => Promise<void>;
  setPetDisplayMode: (mode: PetDisplayMode) => Promise<void>;
  cyclePetDisplayMode: () => Promise<void>;
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  installUpdate: () => Promise<void>;
  hideAllWindows: () => void;
  clear: () => void;
}

const DesktopContext = createContext<DesktopContextValue | null>(null);

// ============================================================
// Provider
// ============================================================

export function DesktopProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(desktopReducer, null, createInitialState);

  useEffect(() => {
    document.documentElement.dataset.colorTheme = state.desktopSettings.colorTheme;
  }, [state.desktopSettings.colorTheme]);

  // ---- 辅助函数 ----

  const applyDesktopSettings = useCallback((settings: DesktopSettingsState): void => {
    const petDisplayMode = normalizePetDisplayMode(
      settings.petDisplayMode,
      settings.petAnimationsEnabled
    );
    const nextSettings = {
      ...settings,
      colorTheme: normalizeColorTheme(settings.colorTheme),
      panelLayout: normalizePanelLayout(settings.panelLayout),
      petDisplayMode,
      petAnimationsEnabled: petDisplayMode === "dynamic"
    };
    localStorage.setItem(PET_DISPLAY_MODE_STORAGE_KEY, petDisplayMode);
    localStorage.setItem(COLOR_THEME_STORAGE_KEY, nextSettings.colorTheme);
    localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, nextSettings.panelLayout);
    document.documentElement.dataset.colorTheme = nextSettings.colorTheme;
    localStorage.setItem(
      PET_ANIMATIONS_STORAGE_KEY,
      String(nextSettings.petAnimationsEnabled)
    );
    dispatch({ type: "SET_DESKTOP_SETTINGS", payload: nextSettings });
  }, []);

  const synchronizeDesktopSettings = useCallback(
    async (settings: DesktopSettingsState): Promise<void> => {
      if (settings.petDisplayModePersisted) {
        applyDesktopSettings(settings);
        return;
      }

      const migratedSettings = await window.xiaoelongDesktop?.migratePetDisplayMode?.(
        INITIAL_PET_DISPLAY_MODE
      );
      applyDesktopSettings(
        migratedSettings ?? {
          ...settings,
          petDisplayMode: INITIAL_PET_DISPLAY_MODE,
          petAnimationsEnabled: INITIAL_PET_DISPLAY_MODE === "dynamic",
          petDisplayModePersisted: true
        }
      );
    },
    [applyDesktopSettings]
  );

  // ---- Handler ----

  const setActiveTab = useCallback((tab: ModuleTab): void => {
    dispatch({ type: "SET_ACTIVE_TAB", payload: tab });
  }, []);

  const togglePanel = useCallback((): void => {
    const shouldCloseVisibleHome = state.panelView === "home" && state.panelOpen;
    dispatch({ type: "SET_PANEL_VIEW", payload: "home" });
    if (window.xiaoelongDesktop?.toggleHomePanel) {
      dispatch({ type: "SET_PANEL_OPEN", payload: !shouldCloseVisibleHome });
      window.xiaoelongDesktop.toggleHomePanel();
      return;
    }
    dispatch({ type: "SET_PANEL_OPEN", payload: !state.panelOpen });
  }, [state.panelView, state.panelOpen]);

  const openSettings = useCallback((): void => {
    const shouldCloseVisibleSettings = state.panelView === "settings" && state.panelOpen;
    dispatch({ type: "SET_PANEL_VIEW", payload: "settings" });
    if (shouldCloseVisibleSettings) {
      dispatch({ type: "SET_PANEL_OPEN", payload: false });
    }
    if (window.xiaoelongDesktop?.openSettingsPanel) {
      window.xiaoelongDesktop.openSettingsPanel();
      return;
    }
    dispatch({ type: "SET_PANEL_OPEN", payload: true });
  }, [state.panelView, state.panelOpen]);

  const setPetReaction = useCallback((reaction: PetReaction | null): void => {
    dispatch({ type: "SET_PET_REACTION", payload: reaction });
  }, []);

  const setDeleteConfirmOpen = useCallback((open: boolean): void => {
    dispatch({ type: "SET_DELETE_CONFIRM_OPEN", payload: open });
  }, []);

  const setDetailsOpen = useCallback((open: boolean): void => {
    dispatch({ type: "SET_DETAILS_OPEN", payload: open });
  }, []);

  const hideAllWindows = useCallback((): void => {
    window.xiaoelongDesktop?.hideAllWindows?.();
  }, []);

  const toggleLoginAtStartup = useCallback(async (): Promise<void> => {
    const nextSettings = await window.xiaoelongDesktop?.setLoginAtStartup?.(
      !state.desktopSettings.openAtLogin
    );
    if (nextSettings) {
      applyDesktopSettings(nextSettings);
    }
  }, [state.desktopSettings.openAtLogin, applyDesktopSettings]);

  const togglePanelTopmost = useCallback(async (): Promise<void> => {
    const nextSettings = await window.xiaoelongDesktop?.setPanelAlwaysOnTop?.(
      !state.desktopSettings.panelAlwaysOnTop
    );
    if (nextSettings) {
      applyDesktopSettings(nextSettings);
    }
  }, [state.desktopSettings.panelAlwaysOnTop, applyDesktopSettings]);

  const setColorTheme = useCallback(async (theme: ColorTheme): Promise<void> => {
    const nextTheme = normalizeColorTheme(theme);
    localStorage.setItem(COLOR_THEME_STORAGE_KEY, nextTheme);
    document.documentElement.dataset.colorTheme = nextTheme;
    dispatch({
      type: "SET_DESKTOP_SETTINGS",
      payload: { ...state.desktopSettings, colorTheme: nextTheme }
    });

    const nextSettings = await window.xiaoelongDesktop?.setColorTheme?.(nextTheme);
    if (nextSettings) {
      applyDesktopSettings(nextSettings);
    }
  }, [state.desktopSettings, applyDesktopSettings]);

  const setPanelLayout = useCallback(async (layout: PanelLayout): Promise<void> => {
    const nextLayout = normalizePanelLayout(layout);
    localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, nextLayout);
    dispatch({
      type: "SET_DESKTOP_SETTINGS",
      payload: { ...state.desktopSettings, panelLayout: nextLayout }
    });

    const nextSettings = await window.xiaoelongDesktop?.setPanelLayout?.(nextLayout);
    if (nextSettings) {
      applyDesktopSettings(nextSettings);
    }
  }, [state.desktopSettings, applyDesktopSettings]);

  const setPetDisplayMode = useCallback(async (mode: PetDisplayMode): Promise<void> => {
    const nextMode = normalizePetDisplayMode(mode);
    localStorage.setItem(PET_DISPLAY_MODE_STORAGE_KEY, nextMode);
    localStorage.setItem(PET_ANIMATIONS_STORAGE_KEY, String(nextMode === "dynamic"));
    dispatch({
      type: "SET_DESKTOP_SETTINGS",
      payload: {
        ...state.desktopSettings,
        petDisplayMode: nextMode,
        petAnimationsEnabled: nextMode === "dynamic"
      }
    });

    const nextSettings = await window.xiaoelongDesktop?.setPetDisplayMode?.(nextMode);
    if (nextSettings) {
      applyDesktopSettings(nextSettings);
    }
  }, [state.desktopSettings, applyDesktopSettings]);

  const cyclePetDisplayMode = useCallback(async (): Promise<void> => {
    await setPetDisplayMode(getNextPetDisplayMode(state.desktopSettings.petDisplayMode));
  }, [state.desktopSettings.petDisplayMode, setPetDisplayMode]);

  const checkForUpdates = useCallback(async (): Promise<void> => {
    try {
      const nextState = await window.xiaoelongDesktop?.checkForUpdates?.();
      if (nextState) {
        dispatch({ type: "SET_UPDATE_STATE", payload: nextState });
      }
    } catch (error) {
      dispatch({
        type: "SET_UPDATE_STATE",
        payload: {
          ...state.updateState,
          status: "error",
          message: error instanceof Error ? error.message : "检查更新失败。",
          progress: null
        }
      });
    }
  }, [state.updateState]);

  const downloadUpdate = useCallback(async (): Promise<void> => {
    try {
      const nextState = await window.xiaoelongDesktop?.downloadUpdate?.();
      if (nextState) {
        dispatch({ type: "SET_UPDATE_STATE", payload: nextState });
      }
    } catch (error) {
      dispatch({
        type: "SET_UPDATE_STATE",
        payload: {
          ...state.updateState,
          status: "error",
          message: error instanceof Error ? error.message : "下载更新失败。",
          progress: null
        }
      });
    }
  }, [state.updateState]);

  const installUpdate = useCallback(async (): Promise<void> => {
    await window.xiaoelongDesktop?.installUpdate?.();
  }, []);

  const clear = useCallback((): void => {
    dispatch({ type: "CLEAR" });
  }, []);

  // ---- IPC 事件监听（仅 Desktop 相关的 4 个事件） ----

  useEffect(() => {
    if (!window.xiaoelongDesktop?.isDesktop) {
      return;
    }

    const cleanups: Array<() => void> = [];

    const panelViewCleanup = window.xiaoelongDesktop.onPanelViewChange?.((session) => {
      dispatch({ type: "SET_PANEL_VIEW", payload: session.view });
      dispatch({ type: "SET_PANEL_REVEAL_REQUEST_ID", payload: session.requestId });
    });

    const settingsCleanup = window.xiaoelongDesktop.onSettingsChange?.((settings) => {
      void synchronizeDesktopSettings(settings);
    });

    const updateCleanup = window.xiaoelongDesktop.onUpdateState?.((newState) => {
      dispatch({ type: "SET_UPDATE_STATE", payload: newState });
    });

    const divineReturnCleanup = window.xiaoelongDesktop.onDivineReturn?.(() => {
      dispatch({ type: "SET_PANEL_VIEW", payload: "home" });
      dispatch({ type: "SET_ACTIVE_TAB", payload: "divine" });
    });

    if (panelViewCleanup) {
      cleanups.push(panelViewCleanup);
    }
    if (settingsCleanup) {
      cleanups.push(settingsCleanup);
    }
    if (updateCleanup) {
      cleanups.push(updateCleanup);
    }
    if (divineReturnCleanup) {
      cleanups.push(divineReturnCleanup);
    }

    // 拉取初始状态
    void window.xiaoelongDesktop.getSettings?.().then((settings) => {
      void synchronizeDesktopSettings(settings);
    });
    void window.xiaoelongDesktop.getUpdateState?.().then((newState) => {
      dispatch({ type: "SET_UPDATE_STATE", payload: newState });
    });

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [synchronizeDesktopSettings]);

  // ---- Context value ----

  const value = useMemo<DesktopContextValue>(
    () => ({
      ...state,
      isDesktop: state.desktopRole !== "single",
      setActiveTab,
      togglePanel,
      openSettings,
      setPetReaction,
      setDeleteConfirmOpen,
      setDetailsOpen,
      toggleLoginAtStartup,
      togglePanelTopmost,
      setColorTheme,
      setPanelLayout,
      setPetDisplayMode,
      cyclePetDisplayMode,
      checkForUpdates,
      downloadUpdate,
      installUpdate,
      hideAllWindows,
      clear
    }),
    [
      state,
      setActiveTab,
      togglePanel,
      openSettings,
      setPetReaction,
      setDeleteConfirmOpen,
      setDetailsOpen,
      toggleLoginAtStartup,
      togglePanelTopmost,
      setColorTheme,
      setPanelLayout,
      setPetDisplayMode,
      cyclePetDisplayMode,
      checkForUpdates,
      downloadUpdate,
      installUpdate,
      hideAllWindows,
      clear
    ]
  );

  return <DesktopContext.Provider value={value}>{children}</DesktopContext.Provider>;
}

// ============================================================
// Hook
// ============================================================

export function useDesktop(): DesktopContextValue {
  const ctx = useContext(DesktopContext);
  if (!ctx) {
    throw new Error("useDesktop must be used within DesktopProvider");
  }
  return ctx;
}
