const { app, Tray, Menu, shell, nativeImage } = require("electron");
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
let helperProc = null;
let isQuitting = false;

// Single instance lock — only one copy running at a time
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.setLoginItemSettings({ openAtLogin: true });
app.dock?.hide();

app.whenReady().then(() => {
  createTray();
  updateHelperThenStart();
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
    updateMenu(ok);
    // Consume response body to free socket
    res.resume();
  });
  req.on("error", () => {
    tray.setImage(iconPath("off"));
    tray.setToolTip("Flight Video Helper — parado");
    updateMenu(false);
  });
  req.setTimeout(2000, () => req.destroy());
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
