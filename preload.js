/* 桥接层：暴露同步文件读写 API 给页面（window.fsBridge） */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fsBridge', {
  // 读取某个数据 key 对应的 JSON 文件内容（string），不存在返回 null
  load: (key) => ipcRenderer.sendSync('data:load', key),
  // 写入某个数据 key 到 JSON 文件
  save: (key, value) => ipcRenderer.sendSync('data:save', key, value),
  // 当前数据目录
  getDataDir: () => ipcRenderer.sendSync('data:getDir'),
  // 项目根目录（模板 docx 所在目录，随项目迁移自动适配）
  getProjectRoot: () => ipcRenderer.sendSync('project:getRoot'),
  // 弹出目录选择框（异步），返回是否成功更换
  setDataDir: () => ipcRenderer.invoke('data:setDir'),
  // 打开数据目录（资源管理器）
  openDataDir: () => ipcRenderer.sendSync('data:openDir'),
  // 保存渲染进程 docxgen.js 生成的 DOCX 字节（outDir 输出目录，baseName 文件名前缀，data 为 Uint8Array）
  saveDocx: (outDir, baseName, data) => ipcRenderer.invoke('docx:save', { outDir, baseName, data }),
  // AI 对话代理（config: {baseURL, model, apiKey, temperature, systemPrompt, messages}）
  aiChat: (config) => ipcRenderer.invoke('ai:chat', config),
  // 天气等公开 API 的 GET 代理，返回 {ok, status, body}
  httpGet: (url) => ipcRenderer.invoke('net:get', url),
  // 菜单触发的目录已更换通知
  onDirChanged: (cb) => ipcRenderer.on('dir:changed', (e, dir) => cb && cb(dir))
});
