const { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const AUTH_WIDTH = 440;
const AUTH_HEIGHT = 520;
const AVATAR_WIDTH = 180;
const AVATAR_MOOD_WIDTH = 356;
const AVATAR_HEIGHT = 190;
const PANEL_WIDTH = 560;
const PANEL_HEIGHT = 560;
const SETTINGS_PANEL_WIDTH = 320;
const SETTINGS_PANEL_HEIGHT = 420;
const IMAGE_VIEWER_WIDTH = 840;
const IMAGE_VIEWER_HEIGHT = 640;
const PANEL_GAP = 12;
const PANEL_READY_FALLBACK_MS = 150;
const DESKTOP_MARGIN_RIGHT = 28;
const DESKTOP_MARGIN_BOTTOM = 34;

let authWindow = null;
let avatarWindow = null;
let panelWindow = null;
let imageViewerWindow = null;
let tray = null;
let serverProcess = null;
let dragOffset = null;
let panelOpen = false;
let panelPlacement = "upper-left";
let currentWindowMode = "auth";
let currentPanelView = "home";
let panelAlwaysOnTop = true;
let panelRendererReady = false;
let pendingPanelShow = false;
let panelReadyFallbackTimer = null;
let avatarMoodPromptVisible = false;
let imageViewerState = {
  images: [],
  index: 0
};
let imageViewerReady = false;

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function getBottomRightBounds(width, height) {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  return {
    x: workArea.x + workArea.width - width - DESKTOP_MARGIN_RIGHT,
    y: workArea.y + workArea.height - height - DESKTOP_MARGIN_BOTTOM,
    width,
    height
  };
}

function getCenteredBounds(width, height, referenceBounds = null) {
  const display = referenceBounds ? screen.getDisplayMatching(referenceBounds) : screen.getPrimaryDisplay();
  const workArea = display.workArea;
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width: Math.min(width, workArea.width),
    height: Math.min(height, workArea.height)
  };
}

function clampBoundsToWorkArea(bounds) {
  const display = screen.getDisplayMatching(bounds);
  const workArea = display.workArea;
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);
  return {
    x: clamp(bounds.x, workArea.x, workArea.x + Math.max(0, workArea.width - width)),
    y: clamp(bounds.y, workArea.y, workArea.y + Math.max(0, workArea.height - height)),
    width,
    height
  };
}

function clampAvatarBounds(bounds) {
  const display = screen.getDisplayMatching(bounds);
  const workArea = display.workArea;
  const avatarSize = getAvatarSize();
  return {
    x: clamp(bounds.x, workArea.x, workArea.x + workArea.width - avatarSize.width),
    y: clamp(bounds.y, workArea.y, workArea.y + workArea.height - avatarSize.height),
    width: avatarSize.width,
    height: avatarSize.height
  };
}

function getAvatarSize() {
  return {
    width: AVATAR_MOOD_WIDTH,
    height: AVATAR_HEIGHT
  };
}

function getMascotBoundsFromAvatarWindow() {
  if (!avatarWindow || avatarWindow.isDestroyed()) {
    return null;
  }
  const bounds = avatarWindow.getBounds();
  return {
    x: bounds.x + bounds.width - AVATAR_WIDTH,
    y: bounds.y,
    width: AVATAR_WIDTH,
    height: AVATAR_HEIGHT
  };
}

function setAvatarMoodPromptVisible(visible) {
  if (avatarMoodPromptVisible === visible) {
    return;
  }

  avatarMoodPromptVisible = visible;
  if (panelOpen) {
    updatePanelBounds();
  }
}

function choosePanelPlacement(avatarBounds) {
  const display = screen.getDisplayMatching(avatarBounds);
  const workArea = display.workArea;
  const centerX = avatarBounds.x + avatarBounds.width / 2;
  const centerY = avatarBounds.y + avatarBounds.height / 2;
  const horizontal = centerX < workArea.x + workArea.width / 2 ? "right" : "left";
  const vertical = centerY < workArea.y + workArea.height / 2 ? "lower" : "upper";
  return `${vertical}-${horizontal}`;
}

function getPanelSize(avatarBounds) {
  const display = screen.getDisplayMatching(avatarBounds);
  const workArea = display.workArea;
  if (currentPanelView === "settings") {
    return {
      width: Math.min(SETTINGS_PANEL_WIDTH, Math.max(300, workArea.width - AVATAR_WIDTH - PANEL_GAP - 24)),
      height: Math.min(SETTINGS_PANEL_HEIGHT, Math.max(360, workArea.height - 16))
    };
  }

  return {
    width: Math.min(PANEL_WIDTH, Math.max(320, workArea.width - AVATAR_WIDTH - PANEL_GAP - 24)),
    height: Math.min(PANEL_HEIGHT, Math.max(420, workArea.height - 16))
  };
}

function getPanelMinimumSize() {
  return currentPanelView === "settings" ? [300, 360] : [320, 420];
}

function getPanelBounds(avatarBounds, placement) {
  const size = getPanelSize(avatarBounds);
  const horizontal = placement.endsWith("right") ? "right" : "left";
  const vertical = placement.startsWith("lower") ? "lower" : "upper";
  return clampBoundsToWorkArea({
    x: horizontal === "right" ? avatarBounds.x + avatarBounds.width + PANEL_GAP : avatarBounds.x - size.width - PANEL_GAP,
    y: vertical === "lower" ? avatarBounds.y : avatarBounds.y + avatarBounds.height - size.height,
    width: size.width,
    height: size.height
  });
}

function getRendererUrl(role) {
  if (!process.env.ELECTRON_START_URL) {
    return null;
  }
  const url = new URL(process.env.ELECTRON_START_URL);
  url.searchParams.set("desktopRole", role);
  if (role === "panel") {
    url.searchParams.set("desktopPanelView", currentPanelView);
  }
  return url.toString();
}

function loadRenderer(targetWindow, role) {
  const url = getRendererUrl(role);
  if (url) {
    targetWindow.loadURL(url);
    return;
  }

  targetWindow.loadFile(path.join(app.getAppPath(), "client", "dist", "index.html"), {
    query: {
      desktopRole: role,
      desktopPanelView: role === "panel" ? currentPanelView : "home"
    }
  });
}

function getWebPreferences(role) {
  return {
    preload: path.join(__dirname, "preload.js"),
    contextIsolation: true,
    nodeIntegration: false,
    backgroundThrottling: false,
    additionalArguments: [`--xiaoelong-role=${role}`]
  };
}

function getDesktopSettings() {
  return {
    openAtLogin: app.getLoginItemSettings().openAtLogin,
    panelAlwaysOnTop
  };
}

function sendToRenderers(channel, payload) {
  for (const targetWindow of [authWindow, avatarWindow, panelWindow]) {
    if (targetWindow && !targetWindow.webContents.isDestroyed()) {
      targetWindow.webContents.send(channel, payload);
    }
  }
}

function sendPanelView() {
  if (panelWindow && !panelWindow.webContents.isDestroyed()) {
    panelWindow.webContents.send("desktop:panel-view", currentPanelView);
  }
}

function broadcastSettings() {
  sendToRenderers("desktop:settings", getDesktopSettings());
}

function setPanelAlwaysOnTop(enabled) {
  panelAlwaysOnTop = enabled;
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.setAlwaysOnTop(panelAlwaysOnTop);
  }
  broadcastSettings();
}

function parkPanelWindow() {
  if (!panelWindow || panelWindow.isDestroyed()) {
    return;
  }

  panelWindow.setIgnoreMouseEvents(true);
  panelWindow.setOpacity(0);
  if (!panelWindow.isVisible()) {
    panelWindow.showInactive();
  }
}

function revealPanelWindow() {
  if (!panelWindow || panelWindow.isDestroyed()) {
    return;
  }

  panelWindow.setIgnoreMouseEvents(false);
  panelWindow.setOpacity(1);
  if (!panelWindow.isVisible()) {
    panelWindow.show();
    return;
  }
  panelWindow.moveTop();
}

function showPanelWhenReady() {
  if (!panelWindow || panelWindow.isDestroyed()) {
    return;
  }

  if (!panelRendererReady) {
    pendingPanelShow = true;
    schedulePanelReadyFallback();
    return;
  }

  clearPanelReadyFallback();
  pendingPanelShow = false;
  revealPanelWindow();
}

function clearPanelReadyFallback() {
  if (panelReadyFallbackTimer) {
    clearTimeout(panelReadyFallbackTimer);
    panelReadyFallbackTimer = null;
  }
}

function schedulePanelReadyFallback() {
  clearPanelReadyFallback();
  panelReadyFallbackTimer = setTimeout(() => {
    panelReadyFallbackTimer = null;
    if (!panelWindow || panelWindow.isDestroyed() || !panelOpen || !pendingPanelShow) {
      return;
    }

    panelRendererReady = true;
    pendingPanelShow = false;
    updatePanelBounds();
    revealPanelWindow();
  }, PANEL_READY_FALLBACK_MS);
}

function findTrayIconPath() {
  const appPath = app.getAppPath();
  const sourceIconPath = path.join(appPath, "client", "src", "assets", "xiaoelong-mascot-test.png");
  if (fs.existsSync(sourceIconPath)) {
    return sourceIconPath;
  }

  const distAssetsPath = path.join(appPath, "client", "dist", "assets");
  if (!fs.existsSync(distAssetsPath)) {
    return null;
  }

  const iconFile = fs
    .readdirSync(distAssetsPath)
    .find((fileName) => /^xiaoelong-mascot-test.*\.png$/i.test(fileName));
  return iconFile ? path.join(distAssetsPath, iconFile) : null;
}

function getTrayIcon() {
  const iconPath = findTrayIconPath();
  if (!iconPath) {
    return nativeImage.createEmpty();
  }

  return nativeImage.createFromPath(iconPath).resize({
    width: 16,
    height: 16
  });
}

function hideAllWindows() {
  for (const targetWindow of [authWindow, avatarWindow, panelWindow, imageViewerWindow]) {
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.hide();
    }
  }
}

function showCurrentModeFromTray() {
  if (currentWindowMode === "expanded") {
    showExpandedMode(currentPanelView);
    return;
  }

  if (currentWindowMode === "collapsed") {
    showCollapsedMode();
    return;
  }

  showAuthMode();
}

function createTray() {
  if (tray) {
    return tray;
  }

  tray = new Tray(getTrayIcon());
  tray.setToolTip("小鳄龙之家");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "显示小鳄龙",
        click: showCurrentModeFromTray
      },
      {
        label: "隐藏",
        click: hideAllWindows
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          app.quit();
        }
      }
    ])
  );
  tray.on("click", showCurrentModeFromTray);
  tray.on("double-click", showCurrentModeFromTray);
  return tray;
}

function createAuthWindow() {
  if (authWindow) {
    return authWindow;
  }

  authWindow = new BrowserWindow({
    width: AUTH_WIDTH,
    height: AUTH_HEIGHT,
    minWidth: AUTH_WIDTH,
    minHeight: AUTH_HEIGHT,
    frame: false,
    transparent: false,
    backgroundColor: "#f6fff9",
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: getWebPreferences("auth")
  });

  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;
  authWindow.setBounds({
    x: Math.round(workArea.x + (workArea.width - AUTH_WIDTH) / 2),
    y: Math.round(workArea.y + (workArea.height - AUTH_HEIGHT) / 2),
    width: AUTH_WIDTH,
    height: AUTH_HEIGHT
  });

  loadRenderer(authWindow, "auth");
  authWindow.once("ready-to-show", () => {
    if (authWindow) {
      authWindow.show();
    }
  });
  authWindow.on("closed", () => {
    authWindow = null;
  });
  return authWindow;
}

function createAvatarWindow() {
  if (avatarWindow) {
    return avatarWindow;
  }

  const avatarSize = getAvatarSize();
  avatarWindow = new BrowserWindow({
    ...getBottomRightBounds(avatarSize.width, avatarSize.height),
    minWidth: AVATAR_MOOD_WIDTH,
    minHeight: AVATAR_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: getWebPreferences("avatar")
  });

  loadRenderer(avatarWindow, "avatar");
  avatarWindow.once("ready-to-show", () => {
    if (avatarWindow) {
      avatarWindow.show();
    }
  });
  avatarWindow.on("closed", () => {
    avatarWindow = null;
  });
  return avatarWindow;
}

function createPanelWindow() {
  if (panelWindow) {
    return panelWindow;
  }

  panelRendererReady = false;
  pendingPanelShow = false;

  panelWindow = new BrowserWindow({
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    minWidth: 300,
    minHeight: 150,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    alwaysOnTop: panelAlwaysOnTop,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: getWebPreferences("panel")
  });

  panelWindow.setOpacity(0);
  panelWindow.setIgnoreMouseEvents(true);
  loadRenderer(panelWindow, "panel");
  panelWindow.webContents.once("did-finish-load", () => {
    sendPanelView();
    broadcastSettings();
  });
  panelWindow.on("closed", () => {
    panelWindow = null;
    panelRendererReady = false;
    pendingPanelShow = false;
    clearPanelReadyFallback();
  });
  return panelWindow;
}

function getImageViewerHtml() {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' http://localhost:3001 http://127.0.0.1:3001 data: blob:; img-src * data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: #eef1f3;
      color: #263238;
      font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
      user-select: none;
    }
    .viewer {
      display: grid;
      grid-template-rows: 42px minmax(0, 1fr) 34px;
      width: 100vw;
      height: 100vh;
      padding: 10px;
      gap: 8px;
    }
    .topbar {
      -webkit-app-region: drag;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
    }
    .meta {
      min-width: 0;
      overflow: hidden;
      color: rgba(38, 50, 56, 0.72);
      font-size: 13px;
      font-weight: 650;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    button {
      -webkit-app-region: no-drag;
      display: inline-grid;
      place-items: center;
      border: 1px solid rgba(83, 101, 111, 0.18);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.82);
      color: #263238;
      cursor: pointer;
      font: inherit;
    }
    button:hover { background: #fff; }
    .close {
      width: 34px;
      height: 34px;
      padding: 0;
      font-size: 24px;
      line-height: 1;
    }
    .stage {
      position: relative;
      display: grid;
      min-height: 0;
      place-items: center;
      overflow: hidden;
      border-radius: 14px;
      background: #dde3e7;
    }
    img {
      display: block;
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    .nav {
      position: absolute;
      top: 50%;
      width: 44px;
      height: 44px;
      border: 0;
      background: transparent;
      color: rgba(38, 50, 56, 0.76);
      padding: 0;
      font-size: 44px;
      line-height: 1;
      transform: translateY(-50%);
    }
    .nav:hover {
      background: transparent;
      color: #263238;
    }
    .previous { left: 12px; }
    .next { right: 12px; }
    .caption {
      min-width: 0;
      overflow: hidden;
      color: rgba(38, 50, 56, 0.66);
      font-size: 12px;
      text-align: center;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <main class="viewer">
    <header class="topbar">
      <div class="meta" id="meta"></div>
      <button type="button" class="close" id="close" aria-label="关闭">×</button>
    </header>
    <section class="stage">
      <button type="button" class="nav previous" id="previous" aria-label="上一张">‹</button>
      <img id="image" alt="" />
      <button type="button" class="nav next" id="next" aria-label="下一张">›</button>
    </section>
    <div class="caption" id="caption"></div>
  </main>
  <script>
    const meta = document.getElementById("meta");
    const caption = document.getElementById("caption");
    const image = document.getElementById("image");
    const previous = document.getElementById("previous");
    const next = document.getElementById("next");
    const close = document.getElementById("close");

    function render(state) {
      const images = state.images || [];
      const current = images[state.index] || null;
      previous.style.display = images.length > 1 ? "inline-grid" : "none";
      next.style.display = images.length > 1 ? "inline-grid" : "none";
      if (!current) {
        meta.textContent = "";
        caption.textContent = "";
        image.removeAttribute("src");
        image.alt = "";
        return;
      }
      meta.textContent = (state.index + 1) + "/" + images.length + " · " + (current.userNickname || "");
      caption.textContent = current.name || "";
      image.src = current.url;
      image.alt = current.name || "";
    }

    previous.addEventListener("click", () => window.xiaoelongImageViewer.previous());
    next.addEventListener("click", () => window.xiaoelongImageViewer.next());
    close.addEventListener("click", () => window.xiaoelongImageViewer.close());
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        window.xiaoelongImageViewer.close();
      } else if (event.key === "ArrowLeft") {
        window.xiaoelongImageViewer.previous();
      } else if (event.key === "ArrowRight") {
        window.xiaoelongImageViewer.next();
      }
    });
    window.xiaoelongImageViewer.onStateChange(render);
  </script>
</body>
</html>`;
}

function sendImageViewerState() {
  if (!imageViewerWindow || imageViewerWindow.isDestroyed() || !imageViewerReady) {
    return;
  }

  imageViewerWindow.webContents.send("desktop:image-viewer-state", imageViewerState);
}

function createImageViewerWindow(referenceBounds = null) {
  if (imageViewerWindow) {
    return imageViewerWindow;
  }

  imageViewerReady = false;
  imageViewerWindow = new BrowserWindow({
    ...getCenteredBounds(IMAGE_VIEWER_WIDTH, IMAGE_VIEWER_HEIGHT, referenceBounds),
    minWidth: 480,
    minHeight: 360,
    frame: false,
    transparent: false,
    backgroundColor: "#eef1f3",
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: getWebPreferences("imageViewer")
  });

  imageViewerWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(getImageViewerHtml())}`);
  imageViewerWindow.webContents.once("did-finish-load", () => {
    imageViewerReady = true;
    sendImageViewerState();
  });
  imageViewerWindow.on("closed", () => {
    imageViewerWindow = null;
    imageViewerReady = false;
  });
  return imageViewerWindow;
}

function showImageViewer(payload) {
  const images = Array.isArray(payload?.images)
    ? payload.images
        .map((image) => ({
          url: typeof image?.url === "string" ? image.url : "",
          name: typeof image?.name === "string" ? image.name : "",
          userNickname: typeof image?.userNickname === "string" ? image.userNickname : ""
        }))
        .filter((image) => image.url)
    : [];

  if (images.length === 0) {
    return;
  }

  const nextIndex = clamp(Number(payload?.index) || 0, 0, images.length - 1);
  imageViewerState = {
    images,
    index: nextIndex
  };

  const referenceWindow = panelWindow && !panelWindow.isDestroyed() ? panelWindow : avatarWindow;
  const referenceBounds = referenceWindow && !referenceWindow.isDestroyed() ? referenceWindow.getBounds() : null;
  const targetWindow = createImageViewerWindow(referenceBounds);
  targetWindow.setBounds(getCenteredBounds(IMAGE_VIEWER_WIDTH, IMAGE_VIEWER_HEIGHT, referenceBounds), false);
  sendImageViewerState();
  if (!targetWindow.isVisible()) {
    targetWindow.show();
  }
  targetWindow.focus();
}

function showPreviousImage() {
  if (imageViewerState.images.length === 0) {
    return;
  }

  imageViewerState = {
    ...imageViewerState,
    index: (imageViewerState.index - 1 + imageViewerState.images.length) % imageViewerState.images.length
  };
  sendImageViewerState();
}

function showNextImage() {
  if (imageViewerState.images.length === 0) {
    return;
  }

  imageViewerState = {
    ...imageViewerState,
    index: (imageViewerState.index + 1) % imageViewerState.images.length
  };
  sendImageViewerState();
}

function sendPanelPlacement() {
  for (const targetWindow of [avatarWindow, panelWindow]) {
    if (targetWindow && !targetWindow.webContents.isDestroyed()) {
      targetWindow.webContents.send("desktop:placement", panelPlacement);
    }
  }
}

function updatePanelBounds() {
  if (!avatarWindow || !panelWindow) {
    return;
  }
  const avatarBounds = getMascotBoundsFromAvatarWindow();
  if (!avatarBounds) {
    return;
  }
  panelPlacement = choosePanelPlacement(avatarBounds);
  panelWindow.setMinimumSize(...getPanelMinimumSize());
  panelWindow.setBounds(getPanelBounds(avatarBounds, panelPlacement), false);
  sendPanelPlacement();
}

function showAuthMode() {
  panelOpen = false;
  pendingPanelShow = false;
  clearPanelReadyFallback();
  if (avatarWindow) {
    avatarWindow.hide();
  }
  if (panelWindow) {
    panelWindow.hide();
  }
  createAuthWindow().show();
}

function showCollapsedMode() {
  panelOpen = false;
  pendingPanelShow = false;
  clearPanelReadyFallback();
  if (authWindow) {
    authWindow.hide();
  }
  if (panelWindow) {
    parkPanelWindow();
  }
  createAvatarWindow().show();
  createPanelWindow();
  updatePanelBounds();
  parkPanelWindow();
  sendPanelView();
  broadcastSettings();
}

function showExpandedMode(panelView = "home") {
  panelOpen = true;
  const viewChanged = currentPanelView !== panelView;
  currentPanelView = panelView;
  if (authWindow) {
    authWindow.hide();
  }
  createAvatarWindow().show();
  const nextPanelWindow = createPanelWindow();
  if (viewChanged || !panelRendererReady) {
    panelRendererReady = false;
    pendingPanelShow = true;
    parkPanelWindow();
  }
  updatePanelBounds();
  sendPanelView();
  broadcastSettings();
  showPanelWhenReady();
}

function setWindowMode(mode) {
  currentWindowMode = mode;
  if (mode === "auth") {
    showAuthMode();
    return;
  }
  if (mode === "collapsed") {
    showCollapsedMode();
    return;
  }
  if (mode === "expanded") {
    showExpandedMode("home");
  }
}

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
      CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || "http://localhost:5173,http://127.0.0.1:5173,null",
      INVITE_CODE: process.env.INVITE_CODE || "123456",
      JWT_SECRET: process.env.JWT_SECRET || "desktop-local-secret",
      UPLOAD_ROOT: process.env.UPLOAD_ROOT || path.join(app.getPath("userData"), "uploads"),
      ELECTRON_RUN_AS_NODE: "1"
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

app.whenReady().then(() => {
  startEmbeddedServer();
  createTray();
  createAuthWindow();
});

ipcMain.on("desktop:window-mode", (_event, mode) => {
  if (mode === "auth" || mode === "collapsed" || mode === "expanded") {
    setWindowMode(mode);
  }
});

ipcMain.on("desktop:panel-ready", (event) => {
  if (!panelWindow || panelWindow.isDestroyed() || event.sender !== panelWindow.webContents) {
    return;
  }

  panelRendererReady = true;
  clearPanelReadyFallback();
  if (panelOpen && pendingPanelShow) {
    updatePanelBounds();
    showPanelWhenReady();
  }
});

ipcMain.on("desktop:toggle-home", () => {
  if (currentWindowMode === "expanded" && currentPanelView === "home" && panelWindow?.isVisible()) {
    currentWindowMode = "collapsed";
    showCollapsedMode();
    return;
  }

  currentWindowMode = "expanded";
  showExpandedMode("home");
});

ipcMain.on("desktop:open-settings", () => {
  if (currentWindowMode === "expanded" && currentPanelView === "settings" && panelWindow?.isVisible()) {
    currentWindowMode = "collapsed";
    showCollapsedMode();
    return;
  }

  currentWindowMode = "expanded";
  showExpandedMode("settings");
});

ipcMain.on("desktop:hide-all-windows", () => {
  hideAllWindows();
});

ipcMain.on("desktop:image-viewer-open", (_event, payload) => {
  showImageViewer(payload);
});

ipcMain.on("desktop:image-viewer-close", () => {
  if (imageViewerWindow && !imageViewerWindow.isDestroyed()) {
    imageViewerWindow.hide();
  }
});

ipcMain.on("desktop:image-viewer-previous", () => {
  showPreviousImage();
});

ipcMain.on("desktop:image-viewer-next", () => {
  showNextImage();
});

ipcMain.on("desktop:login", (_event, token) => {
  if (typeof token === "string" && token.length > 0) {
    sendToRenderers("desktop:login", token);
  }
});

ipcMain.on("desktop:mood-preview", () => {
  sendToRenderers("desktop:mood-preview");
});

ipcMain.on("desktop:mood-prompt-visible", (_event, visible) => {
  setAvatarMoodPromptVisible(Boolean(visible));
});

ipcMain.on("desktop:logout", () => {
  sendToRenderers("desktop:logout");
  currentWindowMode = "auth";
  showAuthMode();
});

ipcMain.handle("desktop:settings:get", () => getDesktopSettings());

ipcMain.handle("desktop:settings:set-login-at-startup", (_event, enabled) => {
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled)
  });
  broadcastSettings();
  return getDesktopSettings();
});

ipcMain.handle("desktop:settings:set-panel-always-on-top", (_event, enabled) => {
  setPanelAlwaysOnTop(Boolean(enabled));
  return getDesktopSettings();
});

ipcMain.on("desktop:drag-start", () => {
  if (!avatarWindow) {
    return;
  }
  const cursor = screen.getCursorScreenPoint();
  const bounds = avatarWindow.getBounds();
  dragOffset = {
    x: cursor.x - bounds.x,
    y: cursor.y - bounds.y
  };
});

ipcMain.on("desktop:drag-move", () => {
  if (!avatarWindow || !dragOffset) {
    return;
  }
  const cursor = screen.getCursorScreenPoint();
  const avatarSize = getAvatarSize();
  const nextAvatarBounds = clampAvatarBounds({
    x: cursor.x - dragOffset.x,
    y: cursor.y - dragOffset.y,
    width: avatarSize.width,
    height: avatarSize.height
  });

  avatarWindow.setBounds(nextAvatarBounds, false);
  if (panelOpen) {
    updatePanelBounds();
  }
});

ipcMain.on("desktop:drag-end", () => {
  dragOffset = null;
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
    createAuthWindow();
  }
});
