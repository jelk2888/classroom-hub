const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  Notification,
  screen,
  dialog,
} = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

const RAIL_W = 248;
const CONFIG_NAME = 'board-config.json';

/** setup | board-rail | board-full */
let uiPhase = 'setup';
let mainWindow = null;
let tray = null;
let quitting = false;
let docked = false;
let appIcon = null;
let applyingChrome = false;

function appRoot() {
  return __dirname;
}

function configDirs() {
  return [
    process.env.PORTABLE_EXECUTABLE_DIR,
    path.dirname(process.execPath),
    appRoot(),
    process.cwd(),
  ].filter(Boolean);
}

function configPath() {
  for (const dir of configDirs()) {
    const file = path.join(dir, CONFIG_NAME);
    if (fs.existsSync(file)) return file;
  }
  return path.join(path.dirname(process.execPath), CONFIG_NAME);
}

function defaultConfig() {
  return {
    host: 'test.zjjdg.top',
    port: 5666,
    https: false,
    code: '',
    password: '',
    remember: true,
    autoLogin: false,
    url: '',
  };
}

function readConfig() {
  const file = configPath();
  try {
    if (fs.existsSync(file)) {
      return { ...defaultConfig(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    }
  } catch {
    /* ignore */
  }
  return defaultConfig();
}

function writeConfig(cfg) {
  const next = { ...defaultConfig(), ...cfg };
  if (!next.remember) {
    next.password = '';
    next.autoLogin = false;
  }
  next.url = buildBoardUrl(next);
  const targets = [
    path.join(path.dirname(process.execPath), CONFIG_NAME),
    path.join(appRoot(), CONFIG_NAME),
  ];
  for (const file of [...new Set(targets)]) {
    try {
      fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
    } catch {
      /* ignore */
    }
  }
  return next;
}

function buildBoardUrl(cfg) {
  const host = String(cfg.host || '').trim();
  const port = Number(cfg.port) || 80;
  const proto = cfg.https ? 'https' : 'http';
  if (!host) return '';
  const needPort = !(cfg.https && port === 443) && !(!cfg.https && port === 80);
  const base = needPort ? `${proto}://${host}:${port}` : `${proto}://${host}`;
  return `${base}/?mode=desktop`;
}

function loadAppIcon() {
  const candidates = [
    path.join(appRoot(), 'assets', 'app.ico'),
    path.join(appRoot(), 'assets', 'app.png'),
    path.join(path.dirname(process.execPath), 'assets', 'app.ico'),
    path.join(path.dirname(process.execPath), 'assets', 'app.png'),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const img = nativeImage.createFromPath(p);
    if (!img.isEmpty()) {
      const sz = img.getSize();
      if (sz.width > 32) return img.resize({ width: 32, height: 32 });
      return img;
    }
  }
  return nativeImage.createEmpty();
}

function workArea() {
  return screen.getPrimaryDisplay().workArea;
}

function sendMode(mode) {
  try {
    mainWindow?.webContents?.send('desktop-mode', mode);
  } catch {
    /* ignore */
  }
}

/** 登录页：最小化灰掉；最大化也灰掉 */
function applySetupChrome() {
  if (!mainWindow) return;
  applyingChrome = true;
  uiPhase = 'setup';
  docked = false;
  try {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
  } catch {
    /* ignore */
  }
  mainWindow.setMinimizable(false);
  mainWindow.setMaximizable(false);
  mainWindow.setResizable(true);
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setSkipTaskbar(false);
  mainWindow.setSize(520, 720);
  mainWindow.center();
  applyingChrome = false;
  if (tray) tray.setToolTip('教室大屏智控 · 登录设置');
}

/** 右侧今日课表：最小化按钮灰掉不可点；最大化=展开大屏 */
function dockRail() {
  if (!mainWindow || quitting) return;
  applyingChrome = true;
  uiPhase = 'board-rail';
  docked = true;
  sendMode('rail');
  try {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
  } catch {
    /* ignore */
  }
  const area = workArea();
  mainWindow.setResizable(true);
  mainWindow.setMinimizable(false); // 已是课表条，最小化变灰
  mainWindow.setMaximizable(true); // 最大化 → 展示大屏
  // 右侧课表不置顶，避免盖住教师课件/PPT
  mainWindow.setAlwaysOnTop(false);
  mainWindow.setSkipTaskbar(false);
  mainWindow.setBounds({
    x: area.x + area.width - RAIL_W,
    y: area.y,
    width: RAIL_W,
    height: area.height,
  });
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.showInactive();
  applyingChrome = false;
  if (tray) tray.setToolTip('教室大屏智控 · 右侧今日课表（点最大化可展示大屏）');
}

/** 展示大屏（任务内容 / 用户点最大化） */
function expandMain(payload) {
  if (!mainWindow || quitting) return;
  applyingChrome = true;
  uiPhase = 'board-full';
  docked = false;
  sendMode('full');
  mainWindow.setResizable(true);
  mainWindow.setMinimizable(true); // 可再收成右侧课表
  mainWindow.setMaximizable(true);
  mainWindow.setSkipTaskbar(false);
  mainWindow.setAlwaysOnTop(true);
  try {
    if (!mainWindow.isMaximized()) mainWindow.maximize();
  } catch {
    const area = workArea();
    mainWindow.setBounds({
      x: area.x,
      y: area.y,
      width: area.width,
      height: area.height,
    });
  }
  mainWindow.show();
  mainWindow.focus();
  setTimeout(() => {
    if (uiPhase === 'board-full' && mainWindow && !quitting) {
      mainWindow.setAlwaysOnTop(false);
    }
  }, 8000);
  if (Notification.isSupported() && payload?.title) {
    new Notification({
      title: String(payload.title),
      body: String(payload.subtitle || '教师端有新任务'),
      icon: appIcon,
    }).show();
  }
  applyingChrome = false;
  if (tray) tray.setToolTip('教室大屏智控 · 大屏展示中（最小化可收回课表）');
}

function httpJson(method, urlStr, bodyObj) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      reject(e);
      return;
    }
    const lib = u.protocol === 'https:' ? https : http;
    const body = bodyObj == null ? null : JSON.stringify(bodyObj);
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
        timeout: 12000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let data = {};
          try {
            data = JSON.parse(raw || '{}');
          } catch {
            data = { error: raw || '无效响应' };
          }
          if (res.statusCode >= 400) reject(new Error(data.error || `HTTP ${res.statusCode}`));
          else resolve(data);
        });
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('连接超时，请检查 IP/端口'));
    });
    if (body) req.write(body);
    req.end();
  });
}

async function injectTokenAndReload(token) {
  if (!mainWindow) return;
  const js = `
    try {
      localStorage.setItem('ccp_token', ${JSON.stringify(token)});
      localStorage.removeItem('ccp_api_base');
      localStorage.setItem('ccp_net_path', 'local');
    } catch (e) {}
    location.replace(location.pathname + '?mode=desktop&_t=' + Date.now());
  `;
  await mainWindow.webContents.executeJavaScript(js, true);
}

function createWindow() {
  appIcon = loadAppIcon();
  mainWindow = new BrowserWindow({
    width: 520,
    height: 720,
    show: true,
    title: '教室大屏智控',
    icon: appIcon.isEmpty() ? undefined : appIcon,
    autoHideMenuBar: true,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      preload: path.join(appRoot(), 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  applySetupChrome();
  mainWindow.loadFile(path.join(appRoot(), 'setup.html'));

  mainWindow.on('close', async (e) => {
    if (quitting) return;
    e.preventDefault();
    if (uiPhase === 'setup') {
      const r = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['退出程序', '取消'],
        defaultId: 0,
        cancelId: 1,
        title: '教室大屏智控',
        message: '确定退出？',
      });
      if (r.response === 0) {
        quitting = true;
        app.quit();
      }
      return;
    }
    const r = await dialog.showMessageBox(mainWindow, {
      type: 'question',
      buttons: ['收起为右侧课表', '退出程序', '取消'],
      defaultId: 0,
      cancelId: 2,
      title: '教室大屏智控',
      message: '要怎样处理窗口？',
      detail: '收起后右侧仍显示今日课表；退出将关闭程序。',
      icon: appIcon.isEmpty() ? undefined : appIcon,
    });
    if (r.response === 0) dockRail();
    else if (r.response === 1) {
      quitting = true;
      app.quit();
    }
  });

  // 系统「最小化」：仅大屏模式下可用 → 收成右侧课表
  mainWindow.on('minimize', (e) => {
    if (applyingChrome) return;
    e.preventDefault();
    if (uiPhase === 'setup') return; // 已禁用，兜底
    if (uiPhase === 'board-rail') return; // 已禁用
    dockRail();
  });

  // 系统「最大化」：右侧课表时 → 展示大屏；已是大屏则保持最大化
  mainWindow.on('maximize', () => {
    if (applyingChrome) return;
    if (uiPhase === 'setup') {
      try {
        mainWindow.unmaximize();
      } catch {
        /* ignore */
      }
      return;
    }
    if (uiPhase === 'board-rail' || docked) {
      expandMain();
      return;
    }
    // board-full：确保页面是大屏内容而不只是拉大课表条
    sendMode('full');
    docked = false;
    uiPhase = 'board-full';
    mainWindow.setMinimizable(true);
  });

  mainWindow.on('unmaximize', () => {
    if (applyingChrome) return;
    // 用户还原窗口：若在大屏，保持 full 模式的窗口态即可
    if (uiPhase === 'board-full') sendMode('full');
  });
}

function createTray() {
  appIcon = loadAppIcon();
  tray = new Tray(
    appIcon.isEmpty()
      ? nativeImage.createFromDataURL(
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAJElEQVRYR+3YIQ0AAAgDMOZf9U3g3xkSCAQCgUAgEAgEAoHAF0sH2gABGq3q2QAAAABJRU5ErkJggg==',
        )
      : appIcon,
  );
  tray.setToolTip('教室大屏智控');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '展示大屏', click: () => expandMain() },
      { label: '右侧今日课表', click: () => dockRail() },
      {
        label: '重新登录设置',
        click: () => {
          applySetupChrome();
          mainWindow?.show();
          mainWindow?.loadFile(path.join(appRoot(), 'setup.html'));
        },
      },
      { label: '刷新页面', click: () => mainWindow?.reload() },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on('double-click', () => {
    if (uiPhase === 'setup') mainWindow?.show();
    else if (docked) expandMain();
    else dockRail();
  });
  tray.on('click', () => {
    if (uiPhase === 'setup') {
      mainWindow?.show();
      return;
    }
    if (docked) expandMain();
    else dockRail();
  });
}

ipcMain.handle('setup-load-config', () => readConfig());

ipcMain.handle('setup-save-config', (_e, cfg) => {
  try {
    writeConfig(cfg || {});
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

ipcMain.handle('setup-login-enter', async (_e, cfg) => {
  try {
    const saved = writeConfig(cfg || {});
    const boardUrl = buildBoardUrl(saved);
    if (!boardUrl) return { ok: false, error: '服务器地址无效' };
    const loginApi = new URL(boardUrl);
    loginApi.pathname = '/api/auth/login';
    loginApi.search = '';
    const data = await httpJson('POST', loginApi.toString(), {
      code: saved.code,
      password: saved.password,
    });
    if (!data?.token) return { ok: false, error: '登录成功但未返回 token' };

    await mainWindow.webContents.session.clearStorageData({
      storages: ['localstorage', 'cookies', 'indexdb'],
    });

    // 登录后不最大化：直接进右侧今日课表待命
    await mainWindow.loadURL(boardUrl);
    await injectTokenAndReload(data.token);

    const goRail = () => {
      if (!quitting) dockRail();
    };
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(goRail, 600);
    });
    setTimeout(goRail, 2500);

    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
});

// 教师端有任务：才展开大屏
ipcMain.on('desktop-show', (_e, payload) => expandMain(payload || {}));
ipcMain.on('desktop-hide', () => dockRail());
ipcMain.on('desktop-ready', () => {
  setTimeout(() => {
    if (!quitting) dockRail();
  }, 800);
});

app.whenReady().then(() => {
  try {
    if (process.env.BOARD_AUTO_START === '1') {
      app.setLoginItemSettings({ openAtLogin: true, path: process.execPath });
    }
  } catch {
    /* ignore */
  }
  createWindow();
  createTray();
});

app.on('window-all-closed', (e) => {
  e.preventDefault?.();
});
