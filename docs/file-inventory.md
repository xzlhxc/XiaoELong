# XiaoELong 项目文件清单

> 更新日期：2026-08-13 | 版本：2.1.1

本文档列出项目所有文件和目录的用途，并标识可删除/优化的文件。

---

## 目录树全貌

```
XiaoELong/
├── .github/workflows/                    # GitHub Actions CI
├── client/                               # React 前端 (Vite + TypeScript)
├── deploy/
│   └── server/                           # Windows 服务器部署包发布配置
│       ├── README-SERVER.md              #   部署文档（含每次发版更新说明）
│       ├── package.json + lock           #   部署包根（workspaces: server/shared）
│       └── server/                       #   发布专用配置（.env.example、init.sql）
│   └── XiaoELong-server-<版本>.zip       #   打包产物（脚本生成，已 gitignore）
├── docs/                                 # 正式开发文档（纳入版本控制）
│   └── assets/                           #   设计参考图（小鳄龙托盘/形象.png）
├── electron/                             # Electron 桌面壳
├── node_modules/                         # 根 npm 依赖（已 gitignore）
├── scripts/                              # 工程脚本
├── server/                               # Express + Socket.io 后端
├── shared/                               # 前后端共享类型契约
├── docker-compose.yml                    # 本地 MySQL 容器
├── .nvmrc                                # Node.js 22.23.1 版本固定
├── package.json                          # monorepo 根配置 + electron-builder
├── package-lock.json                     # 依赖锁文件
└── README.md                             # 项目主文档
```

---

## 一、根目录文件

### 配置文件

| 文件 | 作用 | 备注 |
|------|------|------|
| `package.json` | monorepo 根配置，定义 3 个 workspace（client/server/shared）、所有 npm scripts、electron-builder 打包配置 | 核心文件，不可删 |
| `package-lock.json` | npm 依赖版本锁定文件 | 不可删 |
| `.nvmrc` | 本地开发与 CI 使用的 Node.js 版本，固定为 22.23.1 | 不可删 |
| `docker-compose.yml` | 本地开发用 MySQL 8.0 容器，端口 3306，数据库/用户名/密码均为 `xiaoelong` | 不可删 |
| `.gitignore` | 排除 node_modules/、dist/、release/、.env 等 | 不可删 |

### 文档

| 文件 | 作用 | 备注 |
|------|------|------|
| `README.md` | 项目主文档：简介、环境准备、本地开发、构建发布、API 概览 | 不可删 |

### 隐藏目录

| 目录 | 作用 | 备注 |
|------|------|------|
| `.github/workflows/` | GitHub Actions CI：`build-macos.yml`（Node.js 22.23.1、macOS universal 构建，手动触发） | 不可删 |

---

## 二、client/ — React 前端（Vite + TypeScript）

### 配置文件

| 文件 | 作用 |
|------|------|
| `client/package.json` | 前端依赖声明：react、react-dom、socket.io-client、vite、vitest 等 |
| `client/tsconfig.json` | TypeScript 配置：JSX react-jsx、路径别名、strict 模式 |
| `client/tsconfig.node.json` | Vite/Node 端 TypeScript 配置 |
| `client/vite.config.ts` | Vite 构建配置：React 插件、开发服务器端口、API 代理 |
| `client/.env.example` | 前端环境变量模板：`VITE_SERVER_URL=http://localhost:3001` |
| `client/.env` | 本地前端环境变量（已 gitignore） |
| `client/index.html` | SPA 入口 HTML |

### 静态资源

| 文件 | 作用 |
|------|------|
| `client/public/xiaoelong-pet-spritesheet.webp` | 桌宠精灵图（约 5.8MB），供 PetSprite 组件渲染动画帧 |
| `client/src/assets/xiaoelong-mascot.png` | 小鳄龙吉祥物图片（Electron Mac 图标源） |
| `client/src/assets/xiaoelong-mascot-test.png` | 测试用小鳄龙图片 |
| `client/src/assets/xiaoelong-mascot-hitmask.png` | 拖拽命中区域蒙版 |
| `client/src/assets/xiaoelong-pet-manifest.json` | 桌宠精灵动画帧清单 |
| `client/src/assets/deities/` | 七位神明的头像图片：`hu.jpg`、`chui.jpg`、`a.jpg`、`mx.jpg`、`guo.jpg`、`chili.jpg`、`daimeng-hf.jpg` |

### 入口与配置

| 文件 | 行数 | 作用 |
|------|------|------|
| `client/src/main.tsx` | ~90 | React 入口：`createRoot` 挂载 `<AppProviders><App /></AppProviders>` |
| `client/src/App.tsx` | ~73 | 路由式入口：按 `desktopRole`（auth/avatar/panel/divine/single）分发到 6 个页面组件，不再承载业务逻辑 |
| `client/src/AppProviders.tsx` | ~29 | Provider 组合：嵌套 6 个 Context Provider |
| `client/src/config/env.ts` | ~5 | 读取 `import.meta.env.VITE_SERVER_URL` |
| `client/src/vite-env.d.ts` | ~137 | Vite 类型声明 |

### 服务层（services/）

| 文件 | 行数 | 作用 |
|------|------|------|
| `client/src/services/api.ts` | ~155 | REST API 客户端封装：fetch 包装、自动附带 Bearer token、所有 API 函数（join、getMe、getMessages 等） |
| `client/src/services/socket.ts` | ~45 | Socket.io 客户端：`getOrCreateSocket`/`getSharedSocket`（共享连接）、`disconnectSharedSocket` |

### 纯逻辑模块（utils/）

| 文件 | 行数 | 作用 |
|------|------|------|
| `client/src/utils/pet-animation.ts` | ~216 | 桌宠动画状态机：动画模式（idle/happy/excited/sleeping 等）、帧序列、`getPetReaction` |
| `client/src/utils/chat-time.ts` | ~38 | 聊天消息时间格式化：当天显示"HH:mm"，非当天显示完整日期 |
| `client/src/utils/deity-rank-visuals.ts` | ~39 | 神选段位视觉效果：等级颜色、图标、粒子效果配置 |

### 状态管理（contexts/）

6 个 Context 各持 `useReducer`，重构后前端状态从 App.tsx 拆出：

| 文件 | 行数 | 作用 |
|------|------|------|
| `client/src/contexts/DesktopContext.tsx` | ~505 | 桌面窗口状态：desktopRole、窗口显示、桌宠显示模式 |
| `client/src/contexts/AuthContext.tsx` | ~860 | 认证：登录/登出、资料更新、自动续签和多窗口会话对账 |
| `client/src/contexts/DeityContext.tsx` | ~475 | 神选膜拜：列表、段位、膜拜状态及续签时请求失效保护 |
| `client/src/contexts/ChatContext.tsx` | ~520 | 聊天：消息、引用、附件、Socket 订阅、重连补拉及条件会话失效 |
| `client/src/contexts/GomokuContext.tsx` | ~578 | 五子棋：对局状态、落子/撤回互斥、无闪刷新、Socket 分流及续签时请求失效保护 |
| `client/src/contexts/DailyContext.tsx` | ~471 | 每日一题 + 每日心情：题目、答题、心情选择、静默轮询与无闪刷新状态 |

### UI 组件（components/ 三层）

#### atoms/ — 原子组件

| 文件 | 行数 | 作用 |
|------|------|------|
| `client/src/components/atoms/PetSprite.tsx` | ~302 | 桌宠精灵动画：基于 spritesheet 的帧动画渲染 |
| `client/src/components/atoms/EnergyWing.tsx` + `.css` | ~220 + 95 | 能量翅膀装饰动画组件 |
| `client/src/components/atoms/UserAvatar.tsx` | ~49 | 用户头像组件 |
| `client/src/components/atoms/RefreshStatus.tsx` | ~90 | 通用刷新反馈：防重复触发并保证“刷新中”至少稳定显示 650ms |

#### pages/ — 页面组件（按 desktopRole 分发）

| 文件 | 行数 | 作用 |
|------|------|------|
| `client/src/components/pages/AuthPage.tsx` | ~32 | 登录页（未登录角色） |
| `client/src/components/pages/PanelPage.tsx` | ~37 | 主面板页 |
| `client/src/components/pages/PanelContent.tsx` | ~246 | 主面板内容：tab 切换 + 各 panel 组装 |
| `client/src/components/pages/AvatarPage.tsx` | ~20 | 悬浮桌宠页 |
| `client/src/components/pages/SinglePage.tsx` | ~15 | 单窗口页 |
| `client/src/components/pages/DivinePage.tsx` | ~13 | 全屏神选页 |
| `client/src/components/pages/LoadingPage.tsx` | ~15 | 加载页 |

#### panels/ — 面板组件

| 文件 | 行数 | 作用 |
|------|------|------|
| `client/src/components/panels/ChatPanel.tsx` | ~1085 | 聊天面板：消息列表、文字输入、图片/文件上传、右键引用、补拉消息的未读与滚动锚点、滚动到底 |
| `client/src/components/panels/DivineSelectionPanel.tsx` | ~461 | 神选膜拜面板：七位神明卡片、段位展示、膜拜按钮 |
| `client/src/components/panels/GomokuPanel.tsx` | ~452 | 五子棋面板：对局列表、棋盘渲染、落子/撤回交互、邀请选择及刷新状态 |
| `client/src/components/panels/DailyQuestionPanel.tsx` | ~389 | 每日一题面板：题目展示（含可视化附图）、四选一、统计柱状图、答案揭晓及保留内容的刷新状态 |
| `client/src/components/panels/AvatarDock.tsx` | ~363 | 悬浮桌宠容器：拖拽入口、形象展示、面板开关、心情快捷选择 |
| `client/src/components/panels/StatusBar.tsx` | ~192 | 在线状态栏：在线用户列表 + 每日心情选择器 |
| `client/src/components/panels/SettingsProfileForm.tsx` | ~98 | 设置/个人资料表单：昵称、头像、注销、桌宠设置 |
| `client/src/components/panels/JoinForm.tsx` | ~70 | 加入表单：邀请码输入、昵称、头像上传预览 |

### 样式（styles/）

| 文件 | 作用 |
|------|------|
| `client/src/styles/styles.css` | 全局样式：布局、配色、聊天、面板、状态栏等 |
| `client/src/styles/divine-constellation.css` | 神选星座主题视觉样式 |

### 测试（与源码同目录 co-located）

| 文件 | 作用 |
|------|------|
| `client/src/contexts/*.test.tsx` | 6 个 Context 测试（Auth/Chat/Daily/Deity/Desktop/Gomoku） |
| `client/src/components/pages/*.test.tsx` | 7 个页面组件测试 |
| `client/src/components/panels/*.test.tsx` | 7 个面板组件测试（含新增的 DailyQuestionPanel 刷新保真测试） |
| `client/src/services/socket.test.ts` | Socket 共享连接测试 |
| `client/src/utils/chat-time.test.ts` | 聊天时间格式化单测 |
| `client/src/utils/deity-rank-visuals.test.ts` | 神选段位视觉单测 |
| `client/src/utils/pet-animation.test.ts` | 桌宠动画状态机单测 |

### 缓存（已 gitignore）

| 路径 | 作用 |
|------|------|
| `client/node_modules/` | npm 依赖 |
| `client/node_modules/.vite/deps/` | Vite 预构建依赖缓存 |

---

## 三、server/ — Express + Socket.io 后端（TypeScript ESM）

### 配置文件

| 文件 | 作用 |
|------|------|
| `server/package.json` | 后端依赖声明：express、socket.io、mysql2、jsonwebtoken、multer、zod、sanitize-html、node-cron 等 |
| `server/tsconfig.json` | TypeScript 配置：ESM 模块、target ES2022 |
| `server/.env.example` | 后端环境变量模板（含所有配置项说明） |
| `server/.env` | 本地后端环境变量（已 gitignore） |

### 入口与配置

| 文件 | 行数 | 作用 |
|------|------|------|
| `server/src/index.ts` | ~80 | **服务入口**：Express 实例创建、中间件链（cors/json/multer/static）、路由注册（auth/chat/daily-question/daily-mood/deity-worship/gomoku）、Socket 初始化、定时任务启动 |
| `server/src/config/env.ts` | ~60 | 环境变量解析与 Zod 校验：PORT、DB_*、JWT_*、DEEPSEEK_*、UPLOAD_ROOT 等 |
| `server/src/config/db-env.ts` | ~20 | 数据库连接配置提取 |

### 路由层（Routes）

| 文件 | 行数 | 作用 |
|------|------|------|
| `server/src/routes/auth.ts` | ~246 | 认证路由：POST /join、GET /me（获取用户并按需续签）、PUT /me、DELETE /me |
| `server/src/routes/chat.ts` | ~149 | 聊天路由：GET /messages（历史消息）、POST /images（上传图片）、POST /files（上传文件） |
| `server/src/routes/daily-question.ts` | ~80 | 每日一题路由：GET /today（今日题目+统计）、POST /answer（提交答案）、GET /stats（题目统计） |
| `server/src/routes/daily-mood.ts` | ~50 | 每日心情路由：GET /today（今日心情）、POST /（设置心情） |
| `server/src/routes/deity-worship.ts` | ~60 | 神选膜拜路由：GET /today（今日膜拜状态）、POST /（提交膜拜） |
| `server/src/routes/gomoku.ts` | ~177 | 五子棋 REST 路由：GET /games 与邀请、接受、拒绝、落子、撤回操作 |

### Socket 层

| 文件 | 行数 | 作用 |
|------|------|------|
| `server/src/socket/index.ts` | ~300 | **Socket 事件处理核心**：连接认证、在线状态、聊天，以及五子棋 invite/accept/reject/move/undo 的 Service 调用与 Ack |
| `server/src/socket/gomoku-events.ts` | ~20 | 五子棋更新与结束状态的定向广播辅助 |

### 业务服务层（Services）

| 文件 | 行数 | 作用 |
|------|------|------|
| `server/src/services/gomoku-service.ts` | ~491 | **五子棋核心**：创建对局、接受/拒绝、落子、最后一手撤回、防链式撤回、胜负判定及事务并发控制 |
| `server/src/services/daily-question-service.ts` | ~200 | 每日一题服务：同日期 single-flight 合并并发生成、重复键回读权威记录、在线/备用题落库、今日题目与统计、答题提交 |
| `server/src/services/question-generator/provider.ts` | ~15 | 题目生成器接口定义（策略模式） |
| `server/src/services/question-generator/deepseek-provider.ts` | ~330 | DeepSeek AI 生成器：严格 JSON Output、附图 schema 校验、带错误反馈的重试与无附图收尾 |
| `server/src/services/question-generator/mock-provider.ts` | ~30 | Mock 生成器：测试用，返回固定题目 |

### 数据访问层（DB）

| 文件 | 行数 | 作用 |
|------|------|------|
| `server/src/db/pool.ts` | ~15 | MySQL 连接池创建（mysql2/promise，connectionLimit=10） |
| `server/src/db/init.ts` | ~40 | 数据库初始化脚本：读取 init.sql、连接数据库、执行 SQL |
| `server/src/db/init.sql` | ~302 | **数据库 DDL + 渐进式迁移**：创建 7 张表并通过条件式 ALTER 幂等补列；V2.1.1 新增 `gomoku_games.last_undone_move_no` |
| `server/src/db/users.ts` | ~100 | 用户 CRUD：创建（UUID v4）、按 ID 查询、按昵称查询、更新资料、删除（级联） |
| `server/src/db/messages.ts` | ~60 | 消息存取：插入消息（含图片/文件元数据）、查询最近 N 条历史 |
| `server/src/db/daily-questions.ts` | ~80 | 每日一题存取：按日期查询题目、插入题目、查询答案、插入答案、统计 |
| `server/src/db/daily-moods.ts` | ~50 | 每日心情存取：按日期查询、插入/更新心情 |
| `server/src/db/deity-worships.ts` | ~60 | 神选膜拜存取：按日期查询膜拜记录、插入膜拜、统计各神祇膜拜数 |
| `server/src/db/mappers.ts` | ~40 | 数据库行 → 类型对象映射函数 |

### 中间件

| 文件 | 行数 | 作用 |
|------|------|------|
| `server/src/middleware/auth.ts` | ~42 | JWT 认证中间件：注入用户与 claims，并区分 401 和数据库 5xx |

### 工具函数

| 文件 | 行数 | 作用 |
|------|------|------|
| `server/src/utils/jwt.ts` | ~65 | JWT 签发、验证、会话版本迁移与动态续签阈值 |
| `server/src/utils/chat.ts` | ~20 | 聊天内容清洗：sanitize-html 防 XSS |
| `server/src/utils/uploads.ts` | ~20 | 上传目录管理：根据 UPLOAD_ROOT 创建 avatars/chat-images/chat-files 子目录 |
| `server/src/utils/time.ts` | ~15 | 时区工具：获取 Asia/Shanghai 当前日期字符串 |

### 定时任务

| 文件 | 作用 |
|------|------|
| `server/src/jobs/question-scheduler.ts` | 每日题目定时生成：node-cron 按 QUESTION_CRON 调度，每天调用 DeepSeek API 生成新题 |

### 类型

| 文件 | 作用 |
|------|------|
| `server/src/types/express.d.ts` | Express Request 类型扩展：声明 `req.user` 与 `req.accessTokenClaims` |

### 诊断脚本

| 文件 | 作用 |
|------|------|
| `server/src/scripts/deepseek-check.ts` | DeepSeek API 连通性诊断：验证鉴权、检查模型列表、生成一道测试题并校验结构（不写入数据库） |

### 上传目录

| 目录 | 作用 |
|------|------|
| `server/uploads/avatars/` | 用户头像上传目录（含 `.gitkeep` 保留目录结构） |
| `server/uploads/chat-images/` | 聊天图片运行时目录，由服务启动时自动创建 |
| `server/uploads/chat-files/` | 聊天文件运行时目录，由服务启动时自动创建 |

---

## 四、electron/ — Electron 桌面壳（CommonJS）

| 文件 | 行数 | 作用 |
|------|------|------|
| `electron/main.js` | ~1994 | **Electron 主进程**：窗口、托盘、更新、内嵌服务及原子会话 IPC |
| `electron/preload.js` | ~111 | 预加载脚本：暴露窗口、会话续签、设置、更新与拖拽 API |
| `electron/render-session.js` | ~50 | 面板渲染会话管理：stage（透明不可交互）→ reveal（不透明可交互）两阶段防闪烁，3 秒超时兜底 |
| `electron/manual-mac-updater.js` | ~199 | macOS 手动更新逻辑：获取 `latest-mac.json`、版本比较、语义化版本解析、安全校验（大小限制 64KB、格式校验） |
| `electron/image-viewer.html` | ~430 | 独立图片查看器页面：完整适配图片，支持滚轮/键盘缩放、拖拽、导航和防旧图闪现 |
| `electron/assets/xiaoelong-tray-icon.png` | — | 系统托盘图标（macOS，16×16 PNG） |
| `electron/assets/xiaoelong-tray-icon.ico` | — | 系统托盘图标（Windows ICO） |

### 测试

| 文件 | 作用 |
|------|------|
| `electron/render-session.test.mjs` | 渲染会话管理工具单测 |
| `electron/manual-mac-updater.test.mjs` | macOS 更新逻辑单测（版本解析、比较、manifest 校验） |

---

## 五、shared/ — 前后端共享类型契约

| 文件 | 行数 | 作用 |
|------|------|------|
| `shared/package.json` | ~15 | workspace 内部包定义：`@xiaoelong/shared` |
| `shared/tsconfig.json` | ~15 | TypeScript 编译配置（输出到 dist/） |
| `shared/src/index.ts` | ~411 | **类型契约中心**：DTO、Socket 事件（含 `gomoku:undo`）、撤回资格、会话版本、业务常量与共享工具函数 |
| `shared/dist/index.js` | — | 编译产物（dist/ 已 gitignore） |
| `shared/dist/index.d.ts` | — | 类型声明产物（dist/ 已 gitignore） |

---

## 六、scripts/ — 工程脚本

| 文件 | 行数 | 作用 |
|------|------|------|
| `scripts/clean.mjs` | ~30 | 清理构建产物；支持 `--server-only` 定向清理 server/shared，始终保留 deploy 下的 ZIP |
| `scripts/build-server-deploy.mjs` | ~130 | 服务器部署包打包：Windows 使用 PowerShell/.NET，macOS/Linux 使用 `zip`；临时包成功后才替换正式包 |
| `scripts/dev-electron.mjs` | ~80 | 开发环境 Electron 启动器：设置 ELECTRON_START_URL、XIAOELONG_EMBEDDED_SERVER、独立用户数据目录 |
| `scripts/create-mac-update-manifest.mjs` | ~60 | macOS 更新清单生成：读取 release 目录中的 DMG，生成 latest-mac.json（version、fileName、size、sha256、releasedAt） |

### 测试

| 文件 | 作用 |
|------|------|
| `scripts/create-mac-update-manifest.test.mjs` | Mac 更新清单生成逻辑单测 |

---

## 七、deploy/ — 服务器部署包（发布配置 + 脚本产物）

`deploy/server/` 是宝塔 Windows 面板服务器部署包的**发布配置源**。`npm run server:deploy` 会先定向清理并重建 server/shared，再在临时目录组装 dist、package.json 副本和 updates 目录，最后打包成 `deploy/XiaoELong-server-<版本>.zip`（已 gitignore），**git 中不提交源码快照**。新 ZIP 成功生成后才替换旧包，常规 `npm run clean` 不会删除它。zip 上传到服务器解压后即 `C:\wwwroot\server` 部署根。

git 中只保留发布专用文件：

| 文件 | 作用 |
|------|------|
| `deploy/server/package.json` | 部署根 package.json（与根 package.json 不同，仅声明 server/shared 两个 workspace） |
| `deploy/server/package-lock.json` | 部署依赖锁文件 |
| `deploy/server/README-SERVER.md` | 服务器部署与更新说明：部署包生成、宝塔 Windows 面板部署、环境变量、计划任务开机自启、故障排查 |
| `deploy/server/server/.env.example` | **生产环境变量模板**（`NODE_ENV=production`、公网地址、Windows 路径 `C:\wwwroot\server\`），与开发版不同 |
| `deploy/server/server/src/db/init.sql` | **MySQL 5.6 兼容版建表/迁移脚本**（4 处 `JSON`→`TEXT`，与源码版不同），同步包含 `last_undone_move_no` 幂等迁移。保留发布版，脚本不覆盖 |

---

## 八、docs/ — 正式开发文档（纳入版本控制）

| 文件 | 作用 |
|------|------|
| `docs/README.md` | 文档索引与撰写规范：命名规范、格式要求 |
| `docs/file-inventory.md` | 本文件：项目文件清单与用途说明 |
| `docs/architecture.md` | **架构文档**：项目概览、目录结构、5 层架构、Electron 多窗口设计、前端 Context + 三层组件、后端分层、数据库 ER 图、业务流程、通信协议、安全评估、优化建议 |
| `docs/requirements.md` | **需求文档**（375 行）：产品定位、用户画像、功能需求（F1-F15）、非功能需求（安全/可靠/可维护）、架构需求、实施路线图 |
| `docs/assets/` | 设计参考图：`小鳄龙托盘.png`、`小鳄龙形象.png`（无代码引用，纯设计稿） |

---

## 九、结构优化记录（2026-08-12）

本轮仓库整理（组件分类、目录清理、部署脚本化）已完成：

| 项目 | 处理 |
|------|------|
| 根目录 PNG ×2 | ✅ 移入 `docs/assets/` |
| client/src 顶层模块 | ✅ 分类到 `config/`、`services/`、`utils/`、`styles/` |
| deploy 源码快照 | ✅ 移除，改由 `npm run server:deploy` 脚本从源码组装 |
| 构建产物（dist、tsbuildinfo） | ✅ 纳入 `npm run clean`，git 不跟踪 |
| 服务器部署 ZIP | ✅ 由 `npm run server:deploy` 成功生成后替换；`npm run clean` 保留，git 不跟踪 |
| 根 `updates/`（空目录） | 保留（git 不跟踪，部署包打包时由脚本创建） |
| `.DS_Store` | 已 gitignore，磁盘残留无影响 |
| `client/src/assets/xiaoelong-mascot-test.png` | 测试资源，确认无依赖后可删除 |

---

## 十、文件规模统计

| 类别 | 数量 | 说明 |
|------|------|------|
| 配置文件 | ~16 | 根 + client/server/shared/electron + deploy 发布配置 |
| 源代码文件 | ~61 | client + server + electron + shared |
| 测试文件 | 27 | client 24 + Electron 2 + scripts 1 |
| 文档 | ~6 | docs/ 4 + README + deploy README 等 |
| 静态资源 | ~18 | 精灵图、头像、神明图片、样式、图标、docs/assets 设计图 |
| 工程脚本 | 5 | clean、build-server-deploy、dev-electron、create-mac-update-manifest + 1 测试 |
| CI/CD | 1 | build-macos.yml |

---

> **维护规则：** 项目新增或删除文件时，同步更新本文档。至少每次发版前检查一次文件清单。
