# 工地监理总控工作台（桌面便携版）

面向房建 / 市政项目监理部的纯前端监理业务管理工具，打包为 **Windows 免安装绿色程序（portable exe）**。覆盖从旁站、见证取样、材料、进度、投资到监理通知单、来往函件、监理日志、会议纪要的全流程台账与 DOCX 文档生成。

> 所有数据保存在你电脑的本地目录（exe 同级的 `data/`），**不上云、不联网，完全离线可用**。

---

## 功能模块

| 板块 | 说明 |
| --- | --- |
| 总览 (overview) | 项目关键信息、各业务模块数据概览 |
| 今日 (today) | 当日待办 / 待处理事项聚合 |
| 旁站记录 (side) | 旁站监理记录录入、可编辑模板、DOCX 导出 |
| 见证取样 (sample) | 材料见证取样台账，含取样时间 / 送样时间 |
| 进场材料 (material) | 材料 / 构配件报审复查台账 |
| 进度对比 (progress) | 月度进度计划与实际对比，支持编辑 / 删除 |
| 规划细则 (plan) | 监理规划 / 实施细则状态台账（未编制 / 编写中 / 已审批），固定分类：监理规划、监理实施细则、人员分工与职责、危险源清单、项目管理办法 |
| 监理通知单 (notice) | 通知单生成与 DOCX 导出、可编辑模板 |
| 来往函件 (letter) | 函件登记与状态跟踪（已回复 / 未回复 / 不需要回复） |
| 监理日志 (log) | 日志模板管理、生成（先预览后确认添加）、归档 |
| 会议纪要 (meeting) | 纪要文本粘贴 → 清单识别预览 → 结构化记录 |
| 监理用表 (forms) | 标准范本（开工令、旁站记录等）DOCX 生成 |
| 工作联系单 (contact) | 联系单新建 / 编辑 |
| 验收 (accept) | 检验批 / 分项工程验收记录 |
| 投资控制 (invest) | 合同总价、计量 / 进度款 / 变更、合同风险登记 |
| 巡视检查 (inspect) | 巡视检查记录、整改闭环确认 |
| 单位管理 (units) | 参建单位信息管理 |

---

## 技术栈

- **前端**：原生 HTML + CSS + JavaScript（单文件内联，无前端构建步骤）
- **图表**：[ECharts](https://echarts.apache.org/)（内联于 `app.html`）
- **DOCX 生成**：本地 Python 脚本（`jianli-tongzhidan-docx` skill 的 `generate_jianli_docx.py` / `gen_supervise_form.py`），由 Electron 主进程 `main.js` 调用
- **桌面壳**：Electron 31（主进程 `main.js` + 预加载 `preload.js`），数据以 JSON 文件持久化到本地 `data/` 目录

---

## 目录结构

```
监理工作台-桌面版/
├── app.html              # 应用页面（全部 UI 与业务逻辑，内联 ECharts）
├── main.js               # Electron 主进程：窗口 / 数据目录管理 / DOCX 生成
├── preload.js            # 预加载脚本（contextIsolation 安全桥，暴露 fsBridge）
├── package.json          # 桌面版打包配置（electron-builder）
├── package-lock.json
└── 使用说明.txt          # 面向使用者的本地版说明
```

> 仓库不包含 `node_modules/`（依赖）与 `dist_release/`（打包产物）。便携版 `exe` 通过 **Releases** 发布，不进代码树。

---

## 安装与运行（使用者）

1. 前往本仓库 **Releases** 页面，下载 `工地监理总控工作台.exe`。
2. 双击运行即可，无需安装。
3. 数据默认保存在 exe 同级的 `data/` 目录——**整目录拷贝即可迁移**。
4. 通过顶栏「📁 数据目录 …」或菜单「文件 → 选择数据保存目录…」可更换数据存放位置。

> 本程序未做数字签名，Windows SmartScreen 可能提示"未知发布者"，点「仍要运行」即可（功能完整，无安全风险）；若杀毒软件误报，请将程序目录加入白名单。

---

## 从源码自行打包（开发者）

```bash
npm install
npm run dist          # 产出 dist/工地监理总控工作台-1.0.0-便携版.exe（便携版）
# 或 npm run dist:nsi   （安装版）
# 或 npm run pack       （仅解包目录，便于调试）
```

打包依赖 `electron` / `electron-builder`，首次打包会下载 Electron 二进制，请保持网络畅通。

---

## 数据备份与迁移

复制 `data/` 目录下所有 `*.json` 文件到目标机器的对应目录即可。便携版数据结构为：每个业务模块一个 JSON 文件，按 `key` 命名（如 `K.json` 为主项目数据）。

---

## 许可证

[MIT](LICENSE) © 2026 ZGX
