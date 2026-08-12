# 开发文档

本目录存放项目的开发文档，纳入版本控制，随代码一起维护。

## 文档索引

| 文档 | 说明 |
|------|------|
| [`architecture.md`](architecture.md) | 系统架构：目录结构、整体分层、Electron 多窗口、前端 Context、后端分层、数据库 ER 图、通信协议、评估与优化建议 |
| [`requirements.md`](requirements.md) | 需求：产品定位、用户画像、功能需求（F1-F15）、非功能需求、架构需求、实施路线图 |
| [`file-inventory.md`](file-inventory.md) | 全量文件与目录用途说明、可删除文件标记、文件规模统计 |
| [`assets/`](assets/) | 设计参考图（小鳄龙托盘、形象） |

相关文档（不在本目录）：

| 文档 | 说明 |
|------|------|
| [`README.md`](../README.md) | 项目主文档：简介、环境准备、本地开发、构建发布、接口概览 |
| [`CHANGELOG.md`](../CHANGELOG.md) | 各版本更新记录 |
| [`deploy/server/README-SERVER.md`](../deploy/server/README-SERVER.md) | 宝塔 Windows 面板服务器部署与更新 |

## 撰写规范

### 目录结构

所有文档直接放在 `docs/` 根目录下，不分子目录。

### 命名

- 常规文档使用英文文件名，如 `README.md`、`architecture.md`。
- 复杂文档允许中文命名。


### 格式

- 统一使用 Markdown
- 标题用 `#` 语法，文档内从 `##` 开始
- 代码块必须标注语言：` ```ts `、` ```bash `
- 文档末尾保留一行空行

### 内容

- **简洁优先** — 能一句话说清的别写三段
- **结论先行** — 先写"是什么 / 怎么做"，再写"为什么"
- **中文为主** — 正文用中文，专有名词保留英文（如 API、WebSocket、JWT）
- **及时更新** — 代码改动涉及文档时同步更新；过时文档比没有文档更糟

### 读者

面向全栈开发者及 AI agent。