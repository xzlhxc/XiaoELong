/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  readonly xiaoelongDesktop?: {
    readonly isDesktop: boolean;
    readonly role?: "auth" | "avatar" | "panel";
    readonly setWindowMode?: (mode: "auth" | "collapsed" | "expanded") => void;
    readonly toggleHomePanel?: () => void;
    readonly openSettingsPanel?: () => void;
    readonly notifyPanelReady?: () => void;
    readonly notifyLogin?: (token: string) => void;
    readonly hideAllWindows?: () => void;
    readonly previewMoodPrompt?: () => void;
    readonly setMoodPromptVisible?: (visible: boolean) => void;
    readonly requestLogout?: () => void;
    readonly getSettings?: () => Promise<{
      openAtLogin: boolean;
      panelAlwaysOnTop: boolean;
    }>;
    readonly setLoginAtStartup?: (enabled: boolean) => Promise<{
      openAtLogin: boolean;
      panelAlwaysOnTop: boolean;
    }>;
    readonly setPanelAlwaysOnTop?: (enabled: boolean) => Promise<{
      openAtLogin: boolean;
      panelAlwaysOnTop: boolean;
    }>;
    readonly onPanelViewChange?: (callback: (view: "home" | "settings") => void) => () => void;
    readonly onSettingsChange?: (
      callback: (settings: { openAtLogin: boolean; panelAlwaysOnTop: boolean }) => void
    ) => () => void;
    readonly onLogout?: (callback: () => void) => () => void;
    readonly onLogin?: (callback: (token: string) => void) => () => void;
    readonly onMoodPreview?: (callback: () => void) => () => void;
    readonly onPlacementChange?: (
      callback: (placement: "upper-left" | "upper-right" | "lower-left" | "lower-right") => void
    ) => () => void;
    readonly startDrag?: () => void;
    readonly moveDrag?: () => void;
    readonly endDrag?: () => void;
  };
}
