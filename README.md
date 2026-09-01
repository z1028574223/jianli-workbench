# 监理总控工作台（Windows 桌面版）

面向房建 / 市政项目监理部的纯前端监理业务管理工具，基于 Electron 打包为 **Windows 安装程序**。覆盖巡视检查、旁站、见证取样、材料、验收、进度、投资、通知单、来往函件、监理日志、例会纪要、监理月报的全流程台账与规范 DOCX 文档生成，并内置 AI 助手与区县级天气。

> 所有业务数据保存在本机 `data/` 目录，不上云、不联网即可使用（AI / 天气 / 在线功能需联网）。每次启动自动备份最近 7 天数据快照。

---

## 功能模块

| 板块 | 说明 |
| --- | --- |
| 总览 (overview) | 项目概况、**区县级三日天气**（昨日/今日/明日，彩色图标）、待处理事项、投资与进度环形图 |
| 今日 (today) | 全模块待办聚合，一键跳转处理（工作联系单自动排除，无需回复） |
| 现场监理 | 巡视检查、旁站记录（**一键带入当日天气**）、检查验收、材料进场、机械设备、见证取样（含送检知识库）、特种作业 |
| 控制与资料 | 进度对比、投资控制、监理规划/细则、监理日志、监理月报、例会纪要、监理通知单、工作联系单、来往函件、方案审查 |
| 单位管理 (units) | 五方主体信息，自动带入通知单 / 联系单等模块 |
| AI 助手 (ai) | 接入 DeepSeek / 通义 / 智谱 / OpenAI 等兼容接口：对话、**连接测试**、各表单 **AI 优化**（9 处）、例会纪要 **AI 识别** |

## 文档生成（纯前端，无外部依赖）

- **监理通知单 / 工作联系单 / 监理月报**：逐字段对齐官方模板（GB/T 50319 版式，含合并表格、竖排标签、双节文档、签字栏），由内置 [docxgen.js](docxgen.js) 直接生成 OOXML 并打包 DOCX，生成后自动打开。
- **监理用表**：自定义字段表单导出。
- 通知单支持嵌入现场照片（自动压缩，导出为"附件：现场照片"页）。
- 网页模式（直接打开 app.html）下导出为浏览器下载。

## AI 能力

- 各业务表单内置「✨ AI 优化」按钮（巡视、旁站、取样、材料、验收、通知单、联系单），按监理规范语境润色文案。
- 例会纪要支持 Word 上传 / 文本粘贴，本地规则识别与「🤖 AI 识别」双通道抽取清单字段。
- API Key 仅保存在本机 `data/`，桌面版请求经主进程代理转发，前端不暴露密钥；设置面板提供「测试连接」。

## 技术栈

- **桌面壳**：Electron 31（`main.js` 主进程 + `preload.js` contextIsolation 安全桥）
- **前端**：原生 HTML + CSS + JavaScript（单文件 `app.html`，无前端构建步骤）
- **DOCX**：[docxgen.js](docxgen.js)（自实现 ZIP/CRC32，零依赖）
- **图表**：ECharts 5.5（内联，完全离线）；Word 读取：mammoth（内联）
- **天气**：Open-Meteo 免费接口（主进程 `net:get` 代理，规避 file:// 跨域）

## 目录结构

```
监理工作台-桌面版/
├── app.html              # 应用页面（全部 UI 与业务逻辑，内联第三方库）
├── docxgen.js            # 纯前端 DOCX 生成（通知单 / 联系单 / 监理用表 / 月报）
├── main.js               # Electron 主进程：窗口 / 数据读写 / AI 代理 / 天气代理 / 每日备份
├── preload.js            # 预加载脚本（contextIsolation 安全桥，暴露 fsBridge）
├── build.js              # 打包编排（electron-builder + 产物重命名）
├── build/icon.ico        # 应用图标
├── test_docxgen.js       # docxgen.js 回归测试（node test_docxgen.js）
└── 使用说明.txt / 更新说明-*.md
```

## 安装与运行（使用者）

1. 前往本仓库 **Releases** 下载 `jianli-workbench-v1.2.1-setup.exe`。
2. 双击安装（桌面 / 开始菜单自动创建快捷方式）。
3. 数据默认保存在安装目录的 `data/`，每次启动自动快照到 `data/backup/日期/`（保留 7 天）。
4. 菜单「文件 → 选择数据保存目录…」可更换数据位置；整目录拷贝即可迁移。

> 未做数字签名，Windows SmartScreen 可能提示"未知发布者"，点「仍要运行」即可；杀毒软件误报请加白名单。

## 从源码自行打包（开发者）

```bash
npm install
npm run dist          # 产出 dist/监理总控工作台-v1.2.1-setup.exe
npm start             # 本地调试运行
node test_docxgen.js  # DOCX 生成回归测试
```

首次打包会下载 Electron 二进制，国内网络建议设置镜像：

```bash
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/
```

## 数据安全

- 写入为原子操作（临时文件 + 改名），上一版自动留存 `.bak`。
- 启动时自动滚动备份（7 天），误删可从 `data/backup/` 恢复。
- 数据仅存本机，不上传任何服务器。

## 许可证

[MIT](LICENSE) © 2026 ZGX
