const { app, BrowserWindow, Tray, Menu, shell } = require("electron");
const { fork } = require("child_process");
const path = require("path");
const http = require("http");
const https = require("https");
const fs = require("fs");

const PORT = 7842;
const RESOURCES = app.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, "..", "video-helper");

const HELPER_JS = path.join(RESOURCES, "helper.js");
const HELPER_URL_REMOTE = "https://raw.githubusercontent.com/gabrielpiresr/garmin-flight-viewer/main/video-helper/helper.js";

let tray = null;
let statusWindow = null;
let helperProc = null;
let isQuitting = false;

// Single instance lock — only one copy running at a time
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.setLoginItemSettings({ openAtLogin: true });

app.whenReady().then(() => {
  createStatusWindow();
  createTray();
  updateHelperThenStart();
});

app.on("second-instance", () => {
  showStatusWindow();
});

app.on("window-all-closed", (e) => e.preventDefault());

app.on("before-quit", () => {
  isQuitting = true;
  helperProc?.kill();
});

function fetchRemoteHelper() {
  return new Promise((resolve, reject) => {
    https.get(HELPER_URL_REMOTE, { timeout: 10000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    }).on("error", reject).on("timeout", () => reject(new Error("timeout")));
  });
}

function updateHelperThenStart() {
  fetchRemoteHelper()
    .then((remote) => {
      const local = fs.existsSync(HELPER_JS) ? fs.readFileSync(HELPER_JS, "utf8") : "";
      if (remote !== local) {
        fs.writeFileSync(HELPER_JS, remote, "utf8");
      }
    })
    .catch(() => {
      // sem internet ou GitHub fora — usa versão local sem problema
    })
    .finally(() => {
      startHelper();
    });
}

function startHelper() {
  if (isQuitting) return;

  helperProc = fork(HELPER_JS, [], {
    env: {
      ...process.env,
      HELPER_RESOURCES: RESOURCES,
    },
    silent: true,
    // Use the bundled Node runtime when packaged
    execPath: process.execPath,
  });

  helperProc.stderr?.on("data", () => {}); // suppress stderr noise
  helperProc.stdout?.on("data", () => {});

  helperProc.on("exit", (code) => {
    if (!isQuitting) {
      // Restart after 3s if it crashes
      setTimeout(startHelper, 3000);
    }
  });
}

function createTray() {
  tray = new Tray(iconPath("off"));
  tray.setToolTip("Flight Video Helper — iniciando...");
  updateMenu(false);
  checkAndUpdateTray();
  setInterval(checkAndUpdateTray, 5000);
}

function checkAndUpdateTray() {
  const req = http.get(`http://127.0.0.1:${PORT}/health`, (res) => {
    const ok = res.statusCode === 200;
    tray.setImage(iconPath(ok ? "on" : "off"));
    tray.setToolTip(
      ok ? "Flight Video Helper — ativo" : "Flight Video Helper — iniciando..."
    );
    updateStatusWindow(ok);
    updateMenu(ok);
    // Consume response body to free socket
    res.resume();
  });
  req.on("error", () => {
    tray.setImage(iconPath("off"));
    tray.setToolTip("Flight Video Helper — parado");
    updateStatusWindow(false);
    updateMenu(false);
  });
  req.setTimeout(2000, () => req.destroy());
}

function createStatusWindow() {
  statusWindow = new BrowserWindow({
    width: 420,
    height: 300,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: "Flight Video Helper",
    icon: iconPath("on"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  statusWindow.setMenuBarVisibility(false);
  statusWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      statusWindow.hide();
    }
  });
  updateStatusWindow(false);
  statusWindow.show();
}

function showStatusWindow() {
  if (!statusWindow || statusWindow.isDestroyed()) return;
  if (statusWindow.isMinimized()) statusWindow.restore();
  statusWindow.show();
  statusWindow.focus();
}

function updateStatusWindow(running) {
  if (!statusWindow || statusWindow.isDestroyed()) return;
  const dotColor = running ? "#22c55e" : "#f59e0b";
  const title = running ? "Ferramenta rodando" : "Iniciando ferramenta";
  const message = running
    ? "O Flight Video Helper esta ativo. Pode voltar ao sistema e baixar o video com corte e instrumentos."
    : "Aguarde alguns segundos. A ferramenta esta preparando o processamento local de videos.";
  const html = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';" />
    <title>Flight Video Helper</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #020617;
        color: #e5e7eb;
        font-family: Arial, Helvetica, sans-serif;
      }
      main {
        width: 100%;
        padding: 28px;
        text-align: center;
      }
      .status {
        width: 58px;
        height: 58px;
        margin: 0 auto 18px;
        border-radius: 18px;
        display: grid;
        place-items: center;
        background: rgba(15, 23, 42, 0.95);
        border: 1px solid rgba(148, 163, 184, 0.18);
      }
      .dot {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        background: ${dotColor};
        box-shadow: 0 0 22px ${dotColor};
      }
      h1 {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
      }
      p {
        margin: 12px auto 0;
        max-width: 330px;
        color: #cbd5e1;
        font-size: 13px;
        line-height: 1.55;
      }
      small {
        display: block;
        margin-top: 20px;
        color: #64748b;
        font-size: 11px;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="status"><div class="dot"></div></div>
      <h1>${title}</h1>
      <p>${message}</p>
      <small>Porta local: 7842</small>
    </main>
  </body>
</html>`;
  statusWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function updateMenu(running) {
  const menu = Menu.buildFromTemplate([
    {
      label: running
        ? "✓ Helper ativo (porta 7842)"
        : "⏳ Iniciando...",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Abrir app no navegador",
      click: () => shell.openExternal("http://localhost:5173"),
    },
    {
      label: "Mostrar janela de status",
      click: showStatusWindow,
    },
    { type: "separator" },
    {
      label: "Sair",
      click: () => {
        isQuitting = true;
        helperProc?.kill();
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function iconPath(state) {
  const name = state === "on" ? "icon-on.png" : "icon-off.png";
  return path.join(__dirname, "assets", name);
}
