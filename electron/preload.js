const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("xiaoelongDesktop", {
  isDesktop: true
});
