/* 工地监理总控工作台 - Electron 主进程
 * 功能：加载本地 HTML；数据以 JSON 文件保存在用户指定的数据目录；
 *       支持通过菜单/页面按钮更换数据保存目录。
 */
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { URL } = require('url');

let settingsCache = null;

function ensureDir(dir) {
  try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
  catch (e) { console.error('ensureDir 失败', dir, e); }
}

// ---------- 数据目录管理 ----------
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');

function defaultDataDir() {
  // 便携版：数据目录跟随 exe 所在位置（绿色版，便于整目录拷贝迁移）
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data');
  }
  return path.join(app.getPath('userData'), 'data');
}

function loadSettings() {
  if (settingsCache) return settingsCache;
  try {
    if (fs.existsSync(SETTINGS_FILE())) {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8'));
      settingsCache = parsed && typeof parsed === 'object' ? parsed : {};
      return settingsCache;
    }
  } catch (e) { /* 忽略损坏的配置 */ }
  settingsCache = {};
  return settingsCache;
}

function saveSettings(s) {
  try {
    const file = SETTINGS_FILE();
    const tmp = file + '.tmp';
    const value = s && typeof s === 'object' ? s : {};
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
    fs.renameSync(tmp, file);
    settingsCache = value;
  }
  catch (e) { console.error('保存配置失败', e); }
}

function getDataDir() {
  const s = loadSettings();
  return s.dataDir || defaultDataDir();
}

function ensureDataDir(dir) {
  try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
  catch (e) { console.error('创建数据目录失败', e); }
}

function keyToFile(key) {
  // 仅允许安全字符，避免路径穿越
  const safe = String(key).replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_');
  return path.join(getDataDir(), safe + '.json');
}

// ---------- 同步 IPC：数据读写（renderer 用 sendSync） ----------
ipcMain.on('data:load', (event, key) => {
  try {
    const f = keyToFile(key);
    if (fs.existsSync(f)) {
      event.returnValue = fs.readFileSync(f, 'utf8');
    } else {
      event.returnValue = null;
    }
  } catch (e) {
    console.error('data:load 失败', key, e);
    event.returnValue = null;
  }
});

ipcMain.on('data:save', (event, key, value) => {
  try {
    ensureDataDir(getDataDir());
    const f = keyToFile(key);
    // 原子写（临时文件 + 改名），并把上一版留作 .bak，避免写入中断损坏台账数据
    const tmp = f + '.tmp';
    fs.writeFileSync(tmp, value, 'utf8');
    try { if (fs.existsSync(f)) fs.copyFileSync(f, f + '.bak'); } catch (e) { console.error('备份失败', key, e); }
    fs.renameSync(tmp, f);
    event.returnValue = true;
  } catch (e) {
    console.error('data:save 失败', key, e);
    event.returnValue = false;
  }
});

ipcMain.on('data:getDir', (event) => {
  event.returnValue = getDataDir();
});

// 项目根目录（exe 同级目录的上一级，存放旁站记录/监理通知单等模板 docx）
// __dirname 为 监理工作台-桌面版，其上一级即项目根目录。
ipcMain.on('project:getRoot', (event) => {
  event.returnValue = path.dirname(__dirname);
});

// 弹出目录选择框并应用新目录（供菜单与页面按钮复用）
async function pickDataDir(win) {
  const res = await dialog.showOpenDialog(win, {
    title: '选择数据保存目录',
    defaultPath: getDataDir(),
    properties: ['openDirectory', 'createDirectory']
  });
  if (res.canceled || !res.filePaths || !res.filePaths.length) return null;
  const newDir = res.filePaths[0];
  ensureDataDir(newDir);
  const s = loadSettings();
  s.dataDir = newDir;
  saveSettings(s);
  return newDir;
}

// 异步 IPC：更换数据目录（renderer 用 invoke）
ipcMain.handle('data:setDir', async (event) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const newDir = await pickDataDir(win);
    return !!newDir;
  } catch (e) {
    console.error('data:setDir 失败', e);
    return false;
  }
});

// 打开数据目录
ipcMain.on('data:openDir', (event) => {
  try { shell.openPath(getDataDir()); } catch (e) { console.error(e); }
});

// ---------- AI 助手代理（通过主进程转发，避免前端暴露 API Key 和跨域问题） ----------
ipcMain.handle('ai:chat', async (event, { baseURL, model, apiKey, temperature, systemPrompt, messages }) => {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL('/chat/completions', baseURL);
      const body = JSON.stringify({
        model,
        messages: systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages,
        temperature: typeof temperature === 'number' ? temperature : 0.7,
        stream: false
      });
      const mod = url.protocol === 'https:' ? https : http;
      const req = mod.request(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 90000
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              return reject(new Error('HTTP ' + res.statusCode + ': ' + data.slice(0, 300)));
            }
            const json = JSON.parse(data);
            if (json.error) {
              return reject(new Error(json.error.message || JSON.stringify(json.error)));
            }
            resolve(json.choices?.[0]?.message?.content || '（AI 无返回）');
          } catch (e) { reject(e); }
        });
      });
      req.on('error', (err) => reject(err));
      req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
      req.write(body);
      req.end();
    } catch (e) { reject(e); }
  });
});

// ---------- DOCX 落盘 ----------
// 文档内容由渲染进程的 docxgen.js（纯 JS）生成，主进程只负责原子写入并打开文件。
// 临时文件写完后再改名，避免中断留下损坏的 docx。
ipcMain.handle('docx:save', async (event, { outDir, baseName, data }) => {
  try {
    if (!outDir || !baseName || !data) {
      return { success: false, error: '缺少必要参数' };
    }
    ensureDir(outDir);
    const safeBase = String(baseName).replace(/[\\/:*?"<>|]/g, '_');
    const outPath = path.join(outDir, safeBase + '.docx');
    const tmpPath = outPath + '.tmp';
    fs.writeFileSync(tmpPath, Buffer.from(data));
    fs.renameSync(tmpPath, outPath);
    try { shell.openPath(outPath); } catch (e) { console.error('打开 docx 失败', e); }
    return { success: true, path: outPath };
  } catch (e) {
    console.error('docx:save 失败', e);
    return { success: false, error: e.message };
  }
});

// ---------- 网络 GET 代理（天气等公开 API；渲染进程经此转发，避免 file:// 跨域问题） ----------
ipcMain.handle('net:get', async (event, url) => {
  return new Promise((resolve) => {
    try {
      const u = new URL(String(url));
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        return resolve({ ok: false, error: '协议不允许' });
      }
      const mod = u.protocol === 'https:' ? https : http;
      const req = mod.request(u, {
        method: 'GET',
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 jianli-workbench', 'Accept': 'application/json,text/*;q=0.9' }
      }, (res) => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: data }));
      });
      req.on('error', (err) => resolve({ ok: false, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: '请求超时' }); });
      req.end();
    } catch (e) { resolve({ ok: false, error: e.message }); }
  });
});

// ---------- 窗口 ----------
function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: '工地监理总控工作台',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile(path.join(__dirname, 'app.html'));

  // 外部链接（http/https）交给系统默认浏览器；about:blank 等内部窗口（如联系单打印）正常放行
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) {
      try { shell.openExternal(url); } catch (e) { console.error(e); }
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // 菜单：文件（数据目录）、查看、帮助
  const menu = Menu.buildFromTemplate([
    {
      label: '文件',
      submenu: [
        {
          label: '选择数据保存目录…',
          click: async () => {
            const newDir = await pickDataDir(win);
            if (newDir) {
              win.webContents.send('dir:changed', newDir);
              dialog.showMessageBox(win, {
                type: 'info',
                title: '数据目录已更换',
                message: '新的数据保存目录：',
                detail: newDir
              });
            }
          }
        },
        {
          label: '打开数据目录',
          click: () => { shell.openPath(getDataDir()); }
        },
        { type: 'separator' },
        { label: '退出', click: () => app.quit() }
      ]
    },
    {
      label: '查看',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '使用说明',
          click: () => {
            dialog.showMessageBox(win, {
              type: 'info',
              title: '使用说明',
              message: '工地监理总控工作台 - 本地版',
              detail: '版本：v1.2.0\n\n1. 所有数据以 JSON 文件形式保存在「数据目录」中，可随时备份/迁移。\n2. 通过「文件 → 选择数据保存目录…」可更换数据存放位置（更换后数据保存在新目录）。\n3. 如需迁移已有数据，请将旧数据目录中的 *.json 文件复制到新目录。\n4. 每次启动会自动把数据快照备份到数据目录的 backup\\ 下（保留最近 7 天）。\n5. 数据仅存本机，不上传任何服务器。'
            });
          }
        }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);

  win.webContents.on('did-finish-load', () => {
    win.setTitle('工地监理总控工作台');
  });
}

// ---------- 每日启动备份：data/*.json 快照到 data/backup/日期/，保留最近 7 份 ----------
function dailyBackup(){
  try {
    const dir = getDataDir();
    if (!fs.existsSync(dir)) return;
    const bdir = path.join(dir, 'backup');
    fs.mkdirSync(bdir, { recursive: true });
    const d = new Date();
    const ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const dest = path.join(bdir, ymd);
    if (fs.existsSync(dest)) return; // 当天已备份
    fs.mkdirSync(dest, { recursive: true });
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    files.forEach(f => {
      try { fs.copyFileSync(path.join(dir, f), path.join(dest, f)); } catch (e) { console.error('备份单文件失败', f, e); }
    });
    // 只保留最近 7 个日期目录
    const dirs = fs.readdirSync(bdir).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
    while (dirs.length > 7) {
      const oldDir = dirs.shift();
      try { fs.rmSync(path.join(bdir, oldDir), { recursive: true, force: true }); } catch (e) { console.error('清理旧备份失败', oldDir, e); }
    }
    console.log('每日备份完成:', ymd, files.length, '个文件');
  } catch (e) { console.error('每日备份失败', e); }
}

app.whenReady().then(() => {
  ensureDataDir(getDataDir());
  dailyBackup();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
