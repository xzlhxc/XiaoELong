const { app, BrowserWindow, screen } = require("electron");
const path = require("node:path");
const { spawn } = require("node:child_process");

const WINDOW_WIDTH = 380;
const WINDOW_HEIGHT = 620;
const EDGE_TRIGGER = 14;
const EDGE_VISIBLE_WIDTH = 56;

let win = null;
let serverProcess = null;
let isSnapping = false;
let hiddenEdge = null;

function getServerEntryPath() {
  return path.join(app.getAppPath(), "server", "dist", "index.js");
}

function startEmbeddedServer() {
  if (process.env.ELECTRON_START_URL) {
    return;
  }

  const serverEntry = getServerEntryPath();
  serverProcess = spawn(process.execPath, [serverEntry], {
    stdio: "inherit",
    env: {
      ...process.env,
      PORT: process.env.PORT || "3001",
      CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || "http://localhost:5173",
      INVITE_CODE: process.env.INVITE_CODE || "desktop-invite",
      JWT_SECRET: process.env.JWT_SECRET || "desktop-local-secret"
    }
  });

  serverProcess.on("exit", (code) => {
    if (code !== 0) {
      console.error(`[Electron] Embedded server exited with code ${code}.`);
    }
    serverProcess = null;
  });
}

function stopEmbeddedServer() {
  if (!serverProcess) {
    return;
  }
  serverProcess.kill("SIGTERM");
  serverProcess = null;
}

function restoreFromHiddenEdge() {
  if (!win || !hiddenEdge) {
    return;
  }

  const bounds = win.getBounds();
  const workArea = screen.getDisplayMatching(bounds).workArea;

  isSnapping = true;
  if (hiddenEdge === "left") {
    win.setPosition(workArea.x, bounds.y, true);
  } else if (hiddenEdge === "right") {
    win.setPosition(workArea.x + workArea.width - bounds.width, bounds.y, true);
  }
  isSnapping = false;
  hiddenEdge = null;
}

function maybeSnapToEdge() {
  if (!win || isSnapping) {
    return;
  }

  const bounds = win.getBounds();
  const workArea = screen.getDisplayMatching(bounds).workArea;

  const nearLeft = bounds.x <= workArea.x + EDGE_TRIGGER;
  const nearRight = bounds.x + bounds.width >= workArea.x + workArea.width - EDGE_TRIGGER;

  if (!nearLeft && !nearRight) {
    hiddenEdge = null;
    return;
  }

  isSnapping = true;
  if (nearLeft) {
    win.setPosition(workArea.x - bounds.width + EDGE_VISIBLE_WIDTH, bounds.y, true);
    hiddenEdge = "left";
  } else {
    win.setPosition(workArea.x + workArea.width - EDGE_VISIBLE_WIDTH, bounds.y, true);
    hiddenEdge = "right";
  }
  isSnapping = false;
}

function createWindow() {
  win = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 320,
    minHeight: 520,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_START_URL) {
    win.loadURL(process.env.ELECTRON_START_URL);
  } else {
    win.loadFile(path.join(app.getAppPath(), "client", "dist", "index.html"));
  }

  win.on("move", maybeSnapToEdge);
  win.on("focus", restoreFromHiddenEdge);
  win.on("closed", () => {
    win = null;
  });
}

app.whenReady().then(() => {
  startEmbeddedServer();
  createWindow();

  app.setLoginItemSettings({
    openAtLogin: true
  });
});

app.on("window-all-closed", () => {
  stopEmbeddedServer();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  stopEmbeddedServer();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
