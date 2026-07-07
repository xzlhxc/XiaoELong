const { contextBridge, ipcRenderer } = require("electron");

const roleArg = process.argv.find((arg) => arg.startsWith("--xiaoelong-role="));

contextBridge.exposeInMainWorld("xiaoelongDesktop", {
  isDesktop: true,
  role: roleArg ? roleArg.split("=")[1] : "auth",
  setWindowMode: (mode) => ipcRenderer.send("desktop:window-mode", mode),
  toggleHomePanel: () => ipcRenderer.send("desktop:toggle-home"),
  openSettingsPanel: () => ipcRenderer.send("desktop:open-settings"),
  notifyPanelReady: () => ipcRenderer.send("desktop:panel-ready"),
  notifyLogin: (token) => ipcRenderer.send("desktop:login", token),
  hideAllWindows: () => ipcRenderer.send("desktop:hide-all-windows"),
  previewMoodPrompt: () => ipcRenderer.send("desktop:mood-preview"),
  setMoodPromptVisible: (visible) => ipcRenderer.send("desktop:mood-prompt-visible", visible),
  requestLogout: () => ipcRenderer.send("desktop:logout"),
  getSettings: () => ipcRenderer.invoke("desktop:settings:get"),
  setLoginAtStartup: (enabled) => ipcRenderer.invoke("desktop:settings:set-login-at-startup", enabled),
  setPanelAlwaysOnTop: (enabled) => ipcRenderer.invoke("desktop:settings:set-panel-always-on-top", enabled),
  onPanelViewChange: (callback) => {
    const listener = (_event, view) => callback(view);
    ipcRenderer.on("desktop:panel-view", listener);
    return () => ipcRenderer.removeListener("desktop:panel-view", listener);
  },
  onSettingsChange: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on("desktop:settings", listener);
    return () => ipcRenderer.removeListener("desktop:settings", listener);
  },
  onLogout: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("desktop:logout", listener);
    return () => ipcRenderer.removeListener("desktop:logout", listener);
  },
  onLogin: (callback) => {
    const listener = (_event, token) => callback(token);
    ipcRenderer.on("desktop:login", listener);
    return () => ipcRenderer.removeListener("desktop:login", listener);
  },
  onMoodPreview: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("desktop:mood-preview", listener);
    return () => ipcRenderer.removeListener("desktop:mood-preview", listener);
  },
  onPlacementChange: (callback) => {
    const listener = (_event, placement) => callback(placement);
    ipcRenderer.on("desktop:placement", listener);
    return () => ipcRenderer.removeListener("desktop:placement", listener);
  },
  startDrag: () => ipcRenderer.send("desktop:drag-start"),
  moveDrag: () => ipcRenderer.send("desktop:drag-move"),
  endDrag: () => ipcRenderer.send("desktop:drag-end")
});
