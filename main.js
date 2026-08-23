/* 工地监理总控工作台 - Electron 主进程
 * 功能：加载本地 HTML；数据以 JSON 文件保存在用户指定的数据目录；
 *       支持通过菜单/页面按钮更换数据保存目录。
 */
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

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
  try {
    if (fs.existsSync(SETTINGS_FILE())) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8'));
    }
  } catch (e) { /* 忽略损坏的配置 */ }
  return {};
}

function saveSettings(s) {
  try { fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(s, null, 2), 'utf8'); }
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
    fs.writeFileSync(f, value, 'utf8');
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

// ---------- DOCX 生成（直接调用本地 Python，不再依赖手动下载 input.json） ----------
const PYTHON_EXE = 'C:\\Users\\ZGX\\.workbuddy\\binaries\\python\\envs\\default\\Scripts\\python.exe';
const DOCX_SKILL_DIR = 'C:\\Users\\ZGX\\.workbuddy\\skills\\jianli-tongzhidan-docx__skillhub';

function ensureDir(dir) {
  try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
  catch (e) { console.error('ensureDir 失败', dir, e); }
}

ipcMain.handle('docx:generate', async (event, { type, payload, outDir, baseName }) => {
  try {
    if (!type || !payload || !outDir || !baseName) {
      return { success: false, error: '缺少必要参数' };
    }
    ensureDir(outDir);
    const safeBase = String(baseName).replace(/[\\/:*?"<>|]/g, '_');
    const inputPath = path.join(outDir, safeBase + '.input.json');
    const outPath = path.join(outDir, safeBase + '.docx');
    const scriptName = type === 'form' ? 'gen_supervise_form.py' : 'generate_jianli_docx.py';
    const scriptPath = path.join(DOCX_SKILL_DIR, 'scripts', scriptName);

    if (!fs.existsSync(PYTHON_EXE)) {
      return { success: false, error: '未找到 Python 解释器：' + PYTHON_EXE };
    }
    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: '未找到生成脚本：' + scriptPath };
    }

    // 写入 input.json
    fs.writeFileSync(inputPath, JSON.stringify(payload, null, 2), 'utf8');

    // 调用 Python 脚本
    await new Promise((resolve, reject) => {
      const proc = spawn(PYTHON_EXE, [scriptPath, inputPath, outPath], { encoding: 'utf8' });
      let stderr = '';
      proc.stderr.on('data', (data) => { stderr += String(data); });
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outPath)) resolve();
        else reject(new Error(stderr || ('生成失败，退出码 ' + code)));
      });
      proc.on('error', (err) => reject(err));
    });

    // 成功后打开文件
    try { shell.openPath(outPath); } catch (e) { console.error('打开 docx 失败', e); }
    return { success: true, path: outPath };
  } catch (e) {
    console.error('docx:generate 失败', e);
    return { success: false, error: e.message };
  }
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
              detail: '1. 所有数据以 JSON 文件形式保存在「数据目录」中，可随时备份/迁移。\n2. 通过「文件 → 选择数据保存目录…」可更换数据存放位置（更换后数据保存在新目录）。\n3. 如需迁移已有数据，请将旧数据目录中的 *.json 文件复制到新目录。\n4. 数据仅存本机，不上传任何服务器。'
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

app.whenReady().then(() => {
  ensureDataDir(getDataDir());
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
