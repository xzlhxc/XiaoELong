# XiaoELong 项目架构文档

> 版本：2.1.2 | 更新日期：2026-08-17

---

## 一、项目概览

XiaoELong（小鳄龙之家）是一个面向固定小群使用的 Windows/macOS 桌面伴侣应用。以 Electron 桌面悬浮入口为载体，提供实时聊天、每日心情、每日一题（AI 生成）、神选膜拜、五子棋对战等功能。

### 技术栈总览

| 层级 | 技术选型 |
|------|---------|
| 桌面壳 | Electron 43 |
| 前端 | React 18 + TypeScript 5 + Vite 5 |
| 后端 | Node.js 22.23.1 + Express 4 + Socket.io 4 |
| 数据库 | MySQL 8.0 |
| AI 集成 | DeepSeek API（每日一题生成） |
| 共享契约 | `@xiaoelong/shared`（npm workspace 内部包） |
| 包管理 | npm workspaces（monorepo） |
| 测试 | Vitest |
| CI/CD | GitHub Actions（macOS 构建） |

---

## 二、项目目录结构

```
XiaoELong/
├── client/                          # React 前端（Vite 构建）
│   ├── src/
│   │   ├── main.tsx                 # React 入口（挂载 AppProviders + App）
│   │   ├── App.tsx                  # 入口式路由（73行）：按 desktopRole 分发页面
│   │   ├── AppProviders.tsx         # 6 个 Context Provider 组合
│   │   ├── config/
│   │   │   └── env.ts               # 环境变量读取
│   │   ├── services/
│   │   │   ├── api.ts               # REST API 客户端封装
│   │   │   └── socket.ts            # Socket.io 客户端（共享连接）
│   │   ├── utils/
│   │   │   ├── pet-animation.ts     # 桌宠动画状态机
│   │   │   ├── chat-time.ts         # 聊天时间格式化
│   │   │   └── deity-rank-visuals.ts # 神选等级可视化
│   │   ├── contexts/                # ★ 状态管理（6 个 Context + useReducer）
│   │   │   ├── DesktopContext.tsx   # 桌面窗口状态
│   │   │   ├── AuthContext.tsx      # 认证状态
│   │   │   ├── ChatContext.tsx      # 聊天状态
│   │   │   ├── DailyContext.tsx     # 每日一题 + 心情 + 无闪刷新
│   │   │   ├── DeityContext.tsx     # 神选膜拜
│   │   │   └── GomokuContext.tsx    # 五子棋 + 撤回 + 无闪刷新
│   │   ├── components/              # UI 组件（三层）
│   │   │   ├── atoms/               #   原子：PetSprite / EnergyWing / UserAvatar / RefreshStatus
│   │   │   ├── pages/               #   页面：AuthPage / PanelPage / PanelContent / ...
│   │   │   └── panels/              #   面板：ChatPanel / GomokuPanel / AvatarDock / ...
│   │   ├── styles/
│   │   │   ├── styles.css           # 全局样式
│   │   │   └── divine-constellation.css # 神选星座样式
│   │   └── vite-env.d.ts
│   ├── public/
│   │   └── xiaoelong-pet-spritesheet.webp  # 桌宠精灵图
│   ├── src/assets/
│   │   └── deities/                 # 七位神明的头像图片
│   └── vite.config.ts
│
├── server/                          # Express + Socket.io 后端
│   └── src/
│       ├── index.ts                 # ★ 服务入口：Express 实例、路由注册、Socket 初始化
│       ├── config/
│       │   ├── env.ts               # 环境变量解析（zod 校验）
│       │   └── db-env.ts            # 数据库连接配置
│       ├── routes/                  # REST API 路由层
│       │   ├── auth.ts              # POST /join, GET/PUT/DELETE /me
│       │   ├── chat.ts              # GET /messages, POST /images, POST /files
│       │   ├── daily-question.ts    # GET /today, POST /answer, GET /stats
│       │   ├── daily-mood.ts        # GET /today, POST /
│       │   ├── deity-worship.ts     # GET /today, POST /
│       │   └── gomoku.ts            # GET /games, POST /invite/accept/reject/move/undo
│       ├── socket/
│       │   ├── index.ts             # ★ Socket 事件处理：在线状态、聊天、五子棋
│       │   └── gomoku-events.ts     # 五子棋事件广播辅助
│       ├── services/                # 业务逻辑层
│       │   ├── gomoku-service.ts    # 五子棋：创建、落子、撤回、胜负判定（含事务）
│       │   ├── daily-question-service.ts # 每日一题：生成、答题、统计
│       │   └── question-generator/  # 题目生成器（策略模式）
│       │       ├── provider.ts      # 生成器接口定义
│       │       ├── deepseek-provider.ts # DeepSeek AI 生成 + 本地 fallback
│       │       └── mock-provider.ts # 测试用 Mock 生成器
│       ├── db/                      # 数据库访问层
│       │   ├── init.sql             # ★ 数据库建表 + 迁移 SQL
│       │   ├── init.ts              # 数据库初始化脚本
│       │   ├── pool.ts              # MySQL 连接池
│       │   ├── users.ts             # 用户 CRUD
│       │   ├── messages.ts          # 消息存取
│       │   ├── daily-questions.ts   # 每日一题存取
│       │   ├── daily-moods.ts       # 每日心情存取
│       │   ├── deity-worships.ts    # 神选膜拜存取
│       │   └── mappers.ts           # 数据库行 → 领域对象映射
│       ├── middleware/
│       │   └── auth.ts              # JWT 认证中间件（Bearer token 提取 + 验证）
│       ├── jobs/
│       │   └── question-scheduler.ts # 每日一题定时生成（node-cron）
│       ├── utils/
│       │   ├── jwt.ts               # JWT 签发/验证
│       │   ├── chat.ts              # 聊天内容清洗（sanitize-html + XSS 防护）
│       │   ├── uploads.ts           # 文件上传目录管理
│       │   └── time.ts              # 时区工具
│       ├── scripts/
│       │   └── deepseek-check.ts    # DeepSeek API 诊断脚本
│       └── types/
│           └── express.d.ts         # Express Request 类型扩展
│
├── electron/                        # Electron 桌面壳
│   ├── main.js                      # ★ 主进程（~1930行）：窗口管理、IPC、托盘、更新
│   ├── preload.js                   # ★ 预加载脚本：contextBridge 暴露 IPC 接口
│   ├── render-session.js            # 面板渲染会话管理（防闪烁）
│   ├── manual-mac-updater.js        # macOS 手动更新逻辑
│   ├── image-viewer.html            # 图片查看器独立页面
│   └── assets/
│       ├── xiaoelong-tray-icon.png  # 托盘图标 (macOS)
│       └── xiaoelong-tray-icon.ico  # 托盘图标 (Windows)
│
├── shared/                          # 前后端共享类型契约
│   └── src/
│       └── index.ts                 # ★ 所有 DTO 类型、Socket 事件类型、常量定义
│
├── scripts/                         # 工程脚本
│   ├── clean.mjs                    # 清理构建产物
│   ├── build-server-deploy.mjs      # 服务器部署包打包（npm run server:deploy）
│   ├── dev-electron.mjs             # Electron 开发启动
│   └── create-mac-update-manifest.mjs # macOS 更新清单生成
│
├── deploy/                          # 服务器部署包
│   ├── server/                      #   发布配置源（README / package.json / 生产配置）
│   └── XiaoELong-server-<版本>.zip  #   打包产物（脚本生成，gitignore）
├── docs/                            # 正式开发文档
│   └── assets/                      #   设计参考图
├── docker-compose.yml               # 本地 MySQL 开发环境
├── .github/workflows/               # CI/CD
│   └── build-macos.yml              # macOS 通用构建
└── package.json                     # ★ monorepo 根配置（workspaces、scripts、electron-builder）
```

---

## 三、核心架构

### 3.1 整体分层架构

```
┌─────────────────────────────────────────────────┐
│                 Electron 桌面壳                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │ Auth 窗口 │ │Avatar 窗口│ │ Panel 窗口       │  │
│  │ (登录)    │ │(悬浮桌宠) │ │ (聊天/设置面板)  │  │
│  └──────────┘ └──────────┘ └──────────────────┘  │
│  ┌──────────┐ ┌──────────┐                       │
│  │Divine 窗口│ │ImageViewer│ ← 全屏神选 + 图片查看 │
│  └──────────┘ └──────────┘                       │
│        ↕ IPC (preload.js contextBridge)           │
├─────────────────────────────────────────────────┤
│              React 前端 (Vite 构建)                │
│  ┌──────────────────────────────────────────┐    │
│  │  App.tsx (状态管理中心，5 种 DesktopRole)   │    │
│  │  auth | avatar | panel | divine | single  │    │
│  └──────────────┬───────────────────────────┘    │
│      ↕ REST      ↕ Socket.io                      │
├─────────────────────────────────────────────────┤
│          Express + Socket.io 后端                  │
│  ┌──────────┐ ┌──────────┐ ┌────────────────┐   │
│  │  Routes  │ │  Socket  │ │   Services     │   │
│  │ (REST)   │ │ (实时)    │ │ (业务逻辑)     │   │
│  └────┬─────┘ └────┬─────┘ └──────┬─────────┘   │
│       └────────────┴──────────────┘              │
│                     ↓                             │
│              ┌──────────────┐                     │
│              │   DB Layer   │                     │
│              └──────┬───────┘                     │
├─────────────────────┼───────────────────────────┤
│                     ↓                             │
│              ┌──────────────┐                     │
│              │  MySQL 8.0   │                     │
│              └──────────────┘                     │
└─────────────────────────────────────────────────┘
```

### 3.2 Electron 多窗口架构

Electron 主进程管理 **5 种窗口类型**，每种窗口加载同一个 React 应用但传入不同的 `desktopRole`，React 据此渲染不同 UI：

```
Electron Main Process (main.js)
│
├── AuthWindow (440×520)
│   └── desktopRole="auth" → 登录/注册表单
│
├── AvatarWindow (356×190, 透明无框)
│   └── desktopRole="avatar" → 右下角悬浮桌宠 + 心情选择
│
├── PanelWindow (560×560)
│   └── desktopRole="panel" → 聊天/每日一题/神选/五子棋/设置
│
├── DivineWindow (全屏)
│   └── desktopRole="divine" → 全屏神选膜拜界面
│
└── ImageViewerWindow (840×640)
    └── 独立 HTML 页面 → 聊天图片查看器
```

**窗口生命周期状态机：**

```
         ┌─────────┐
   启动 → │  auth   │ (未登录)
         └────┬────┘
              │ 登录成功
              ↓
         ┌──────────┐ 点击桌宠 ┌──────────┐
         │collapsed │────────→│ expanded │
         │(仅桌宠)  │←────────│(桌宠+面板)│
         └──────────┘ 再次点击 └────┬─────┘
                                   │ 选神选 tab
                                   ↓
                              ┌──────────┐
                              │ divine   │ (全屏)
                              └──────────┘
```

**关键设计：面板渲染防闪烁机制**

面板打开时，先 `stagePanelWindow()`（设置为透明不可交互），等待 React 渲染完成后通过 `notifyPanelReady` IPC 确认，再 `revealPanelWindow()`（恢复不透明可交互）。超时 3 秒兜底。渲染崩溃时自动重载恢复。

### 3.3 前端架构（React）

重构后前端采用 **Context + useReducer 状态管理** 与 **三层组件** 结构，`App.tsx` 缩减为入口式路由（73 行），不再承载业务逻辑。

**入口与状态管理：**

- `App.tsx`（73 行）：按 `desktopRole`（auth/avatar/panel/divine/single）分发到 `components/pages/` 下的页面组件
- `AppProviders.tsx`：组合嵌套 6 个 Context Provider
- **6 个 Context**（`contexts/`，各持 `useReducer` + `useContext`，配套 Socket 订阅/分流）：
  - `DesktopContext`：桌面窗口状态、桌宠显示
  - `AuthContext`：认证、用户资料
  - `ChatContext`：聊天消息、上传、基于消息 ID 的向上分页、Socket 订阅，以及重连/网络恢复后的会话隔离补拉
  - `DailyContext`：每日一题、每日心情，以及保留当前内容的刷新状态
  - `DeityContext`：神选膜拜
  - `GomokuContext`：五子棋对局、落子/撤回互斥、无闪刷新与 Socket 事件分流
- 通信层独立为 `services/api.ts`、`services/socket.ts`（共享连接），纯逻辑在 `utils/`

**组件树（三层）：**

```
components/
├── atoms/                            # 原子组件
│   ├── PetSprite                     (桌宠精灵动画)
│   ├── EnergyWing                    (能量翅膀)
│   ├── UserAvatar                    (用户头像)
│   └── RefreshStatus                 (稳定的刷新进度反馈)
├── pages/                            # 页面组件（按 desktopRole 分发）
│   ├── AuthPage                      (auth 角色，未登录)
│   ├── AvatarPage                    (avatar 角色)
│   ├── PanelPage → PanelContent      (panel 角色：tab 切换组装各面板)
│   ├── SinglePage                    (single 角色)
│   ├── DivinePage                    (divine 角色，全屏神选)
│   └── LoadingPage                   (加载页)
└── panels/                           # 面板组件（业务 UI）
    ├── AvatarDock                    (悬浮桌宠容器)
    ├── StatusBar                     (在线用户 + 心情选择)
    ├── ChatPanel                     (聊天 tab)
    ├── DailyQuestionPanel            (每日一题 tab)
    ├── DivineSelectionPanel          (神选 tab)
    ├── GomokuPanel                   (五子棋 tab)
    ├── SettingsProfileForm           (设置视图)
    └── JoinForm                      (加入表单)
```

**数据流模式：**

```
REST API (services/api.ts) ──→ Context dispatch ──→ 组件渲染
Socket 事件 ────────────────→ Context dispatch ──→ 组件渲染
Electron IPC ──────────────→ Context dispatch ──→ 组件渲染
用户操作 ─→ handler ─→ REST/Socket/Electron API ─→ 远端
```

五子棋和每日一题的非静默刷新采用 stale-while-refresh 展示：请求期间继续渲染已加载内容，只在操作区显示设有最短可见时长的“刷新中…”状态，避免快速请求导致整块内容闪烁；每日一题的后台轮询仍保持静默。

### 3.4 后端架构（Express + Socket.io）

**分层架构：**

```
Routes (路由层)         → 参数校验 (zod) → 调用 Service → 返回 JSON
Socket (实时层)         → JWT 认证 → 调用 Service → 广播事件
Services (业务逻辑层)   → 业务规则校验 → 调用 DB Layer → 返回领域对象
DB Layer (数据访问层)   → SQL 查询/事务 → 行映射 → 返回领域对象
```

**关键设计决策：**

| 决策 | 说明 |
|------|------|
| REST + Socket 双通道 | REST 处理一次性请求（CRUD），Socket 处理实时推送（消息、状态变更） |
| Service 层独立 | 五子棋和每日一题的业务逻辑从路由/Socket 中抽离，可独立测试 |
| 策略模式（题目生成） | `QuestionGeneratorProvider` 接口 → DeepSeek 在线 + 本地 fallback |
| 数据库事务 | 五子棋落子和撤回使用 `FOR UPDATE` 行锁 + 事务保证并发安全 |
| JWT 双重认证 | REST 用 `Authorization: Bearer` 头，Socket 用 `auth.token` 握手参数 |

### 3.5 数据库设计（ER 图）

```
users (用户)
├── id: VARCHAR(36) PK
├── nickname: VARCHAR(32)
├── avatar_url: VARCHAR(255)
└── created_at: DATETIME

messages (聊天消息)
├── id: BIGINT AUTO_INCREMENT PK
├── user_id: VARCHAR(36) FK → users(id) ON DELETE CASCADE
├── content: TEXT
├── image_url/name/mime_type/size (可空)
├── file_url/name/mime_type/size (可空)
├── reply_to_message_id: BIGINT (可空，自关联 FK → messages(id))  ← 引用消息
└── created_at: DATETIME

daily_questions (每日一题)
├── id: INT AUTO_INCREMENT PK
├── date: DATE UNIQUE
├── category: VARCHAR(32)
├── question: TEXT
├── options: JSON
├── visual_type/visual_data (可空，附图)
├── correct_answer_index: INT
├── explanation: TEXT
├── source_type: ENUM('online','fallback','manual')
└── source_context: TEXT

daily_answers (答题记录)
├── id: BIGINT AUTO_INCREMENT PK
├── question_id: INT FK → daily_questions(id) ON DELETE CASCADE
├── user_id: VARCHAR(36) FK → users(id) ON DELETE CASCADE
├── answer_index: INT
└── UNIQUE(question_id, user_id)  ← 每人每题仅一次

daily_moods (每日心情)
├── id: BIGINT AUTO_INCREMENT PK
├── user_id: VARCHAR(36) FK → users(id) ON DELETE CASCADE
├── mood_day: DATE
├── emoji: VARCHAR(8)
└── UNIQUE(user_id, mood_day)  ← 每人每天仅一次

deity_worships (神选膜拜)
├── id: BIGINT AUTO_INCREMENT PK
├── user_id: VARCHAR(36) FK → users(id) ON DELETE CASCADE
├── deity_id: VARCHAR(32)
├── worship_day: DATE
└── UNIQUE(user_id, worship_day)  ← 每人每天仅一次

gomoku_games (五子棋对局)
├── id: BIGINT AUTO_INCREMENT PK
├── status: ENUM('invited','playing','finished','declined')
├── invited_by: VARCHAR(36) FK → users(id)
├── player_black: VARCHAR(36) FK → users(id)
├── player_white: VARCHAR(36) FK → users(id)
├── current_turn: VARCHAR(36)
├── winner: VARCHAR(36)
├── board_state: JSON (15×15 二维数组)
├── last_undone_move_no: INT (最近一次被撤回的落子序号，默认 0)
├── created_at / updated_at: DATETIME

gomoku_moves (落子记录)
├── id: BIGINT AUTO_INCREMENT PK
├── game_id: BIGINT FK → gomoku_games(id) ON DELETE CASCADE
├── move_no: INT
├── player_id: VARCHAR(36) FK → users(id)
├── row_idx / col_idx: INT
└── UNIQUE(game_id, move_no) + UNIQUE(game_id, row_idx, col_idx)
```

**数据库迁移策略：** 项目使用条件式 DDL（检查列是否存在再 `ALTER TABLE ADD COLUMN`），`init.sql` 支持幂等执行。V2.1.1 会为旧库添加 `gomoku_games.last_undone_move_no`；部署包中的 MySQL 5.6 兼容脚本同步包含该迁移。

---

## 四、核心业务流程

### 4.1 用户注册与认证

```
┌──────────┐     POST /api/auth/join      ┌──────────┐
│  Client  │ ─── {inviteCode, nickname} ──│  Server  │
│          │                               │          │
│          │ ←── {accessToken, user} ──────│ 1. 校验邀请码
│          │                               │ 2. sanitize 昵称
│ save to │                               │ 3. INSERT users
│localStor│                               │ 4. sign JWT(uid)
└──────────┘                               └──────────┘

后续请求：
REST: Authorization: Bearer <token> → auth middleware → req.user + req.accessTokenClaims
Socket: io(url, { auth: { token } }) → socket middleware → socket.data.userId
```

`GET /api/auth/me` 的响应为 `{ user, accessToken? }`。服务端只对仍有效且账号存在的凭证续签：没有当前会话版本标记的旧 token 会立即升级；当前版本 token 至多提前 7 天返回新的 `accessToken`，短期凭证则按有效期比例提前。客户端通过 Electron 主进程的 compare-and-swap 会话 IPC 原子写入并广播新 token；头像窗口负责常驻定时检查，其他窗口收到广播后重建带新 token 的 REST/Socket 会话。过期或无效 token 仍直接返回 `401`。

### 4.2 实时聊天流程

```
发送方                                服务器                          所有在线用户
──────                              ──────                          ────────────
1. 输入消息
2. [可选] POST /api/chat/images
   上传图片 → 返回 URL
3. socket.emit("chat:send",
   {content, image, file})
                                     4. JWT 验证
                                     5. normalizeChatContent()
                                        (sanitize-html 防 XSS)
                                     6. INSERT messages
                                     7. io.to("room:main")
                                        .emit("chat:message", msg)
                                                                     8. setMessages([...prev, msg])
                                                                     9. React 重渲染聊天列表
```

### 4.3 每日一题生成与答题

```
定时任务 (node-cron, 每天 8:00 Asia/Shanghai)
│
├── 1. check 今天是否已有题目 → 有则跳过
├── 2. 同一日期的并发 ensure 合并为一个 Promise
├── 3. 调用 DeepSeek API 生成题目
│      ├── 全程 JSON Output，并按解析/结构错误最多重试 3 次
│      ├── 最后一次强制 visual=null，优先保住无附图在线题
│      ├── 成功 → 存入 DB，source_type="online"
│      └── 失败 → 使用本地 fallback 题库，source_type="fallback"
├── 4. 跨进程重复写入时回读 date 唯一键对应的正式题目
└── 5. 日志记录生成结果

用户答题：
GET /api/daily-question/today
  → DailyQuestionService.getQuestionWithStatsForUser()
  → 返回题目 + 各选项统计 + 本人是否已答

POST /api/daily-question/answer { questionId, answerIndex }
  → 校验（题存在、选项合法、未重复答）
  → INSERT daily_answers
  → io.emit("question:update") 广播新统计
```

### 4.4 五子棋对局状态机

```
                    ┌──────────┐
          创建邀请 → │ invited  │
                    └────┬─────┘
                    ┌───┴────┐
              白方接受   白方拒绝
                    │         │
                    ↓         ↓
              ┌──────────┐  ┌──────────┐
              │ playing  │  │ declined │
              └──┬───┬───┘  └──────────┘
                 │   │
     合法落子未结束   └─ 撤回最新且未被回应的一手
                 │               │
                 └──────↺────────┘
                 │
            五连珠 / 棋盘满
                 │
                 ↓
              ┌──────────┐
              │ finished │
              └──────────┘
```

**撤回约束：** 服务端只允许落子者在对方尚未行棋时撤回当前最后一手。事务删除该条 `gomoku_moves`、回退 `board_state` 与 `current_turn`，并把落子序号写入 `last_undone_move_no`；同一序号不能反复撤回，也不能继续向前链式回退。响应中的 `undoAvailableTo` 只用于客户端控制按钮展示，最终资格仍由服务端判断。

**并发安全：** 落子与撤回都使用 `SELECT ... FOR UPDATE` 锁定对局行，在事务内完成资格校验和状态写入。若撤回与对方落子同时到达，只会有一个操作按锁定后的最新状态成功。

---

## 五、通信协议

### 5.1 REST API 清单

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/auth/join` | 否 | 邀请码注册 |
| GET | `/api/auth/me` | JWT | 获取当前用户，并按需返回续签后的 `accessToken` |
| PUT | `/api/auth/me` | JWT | 更新昵称/头像 |
| DELETE | `/api/auth/me` | JWT | 注销账户 |
| GET | `/api/chat/messages?limit=50&beforeId=<id>` | JWT | 获取历史消息；`beforeId` 可选，用于向前分页 |
| POST | `/api/chat/images` | JWT | 上传聊天图片 |
| POST | `/api/chat/files` | JWT | 上传聊天文件 |
| GET | `/api/daily-question/today` | JWT | 获取今日题目 |
| POST | `/api/daily-question/answer` | JWT | 提交答案 |
| GET | `/api/daily-question/stats?questionId=` | JWT | 题目统计 |
| GET | `/api/daily-mood/today` | JWT | 获取今日心情 |
| POST | `/api/daily-mood` | JWT | 设置今日心情 |
| GET | `/api/deity-worship/today` | JWT | 获取今日膜拜状态 |
| POST | `/api/deity-worship` | JWT | 提交膜拜 |
| GET | `/api/gomoku/games` | JWT | 获取我的对局列表 |
| POST | `/api/gomoku/invite` | JWT | 发起对局邀请 |
| POST | `/api/gomoku/accept` | JWT | 接受邀请 |
| POST | `/api/gomoku/reject` | JWT | 拒绝邀请 |
| POST | `/api/gomoku/move` | JWT | 落子 |
| POST | `/api/gomoku/undo` | JWT | 撤回自己最后一手 |

### 5.2 Socket.io 事件清单

**客户端 → 服务器：**

| 事件 | Payload | Ack | 说明 |
|------|---------|-----|------|
| `chat:send` | `{content, image?, file?, replyToMessageId?}` | `{ok, error?}` | 发送消息（可引用原消息） |
| `gomoku:invite` | `{targetUserId}` | `{ok, game?, error?}` | 发起对局邀请 |
| `gomoku:accept` | `{gameId}` | `{ok, game?, error?}` | 接受邀请 |
| `gomoku:reject` | `{gameId}` | `{ok, game?, error?}` | 拒绝邀请 |
| `gomoku:move` | `{gameId, row, col}` | `{ok, game?, error?}` | 落子 |
| `gomoku:undo` | `{gameId}` | `{ok, game?, error?}` | 撤回自己最后一手 |

**服务器 → 客户端（广播）：**

| 事件 | Payload | 说明 |
|------|---------|------|
| `presence:init` | `{users: PresenceUser[]}` | 初始在线列表 |
| `presence:online` | `{userId, onlineUserIds, user?}` | 用户上线 |
| `presence:offline` | `{userId, onlineUserIds}` | 用户下线 |
| `user:update` | `{user: UserProfile}` | 用户资料变更 |
| `chat:message` | `ChatMessage` | 新消息 |
| `question:update` | `{questionId, stats}` | 答题统计更新 |
| `mood:update` | `{userId, mood}` | 心情更新 |
| `deity:worship` | `{deity: DeityStatus}` | 神选状态更新 |
| `gomoku:update` | `{game: GomokuGame}` | 对局状态更新 |
| `gomoku:end` | `{game, winner}` | 对局结束 |

### 5.3 Electron IPC 通道

主进程通过 `preload.js` → `contextBridge.exposeInMainWorld` 向渲染进程暴露 `window.xiaoelongDesktop` API：

| 类别 | IPC 方法 | 方向 | 说明 |
|------|---------|------|------|
| 窗口管理 | `setWindowMode` | Renderer→Main | auth/collapsed/expanded |
| 窗口管理 | `toggleHomePanel` | Renderer→Main | 切换面板 |
| 窗口管理 | `hideAllWindows` | Renderer→Main | 隐藏所有窗口 |
| 会话 | `persistAccessToken` / `clearPersistedAccessToken` | Renderer→Main | 读写本地 token |
| 会话 | `refreshAccessToken` / `invalidateAccessToken` | Renderer→Main | 按旧 token compare-and-swap 续签或失效，并广播权威会话 |
| 会话 | `notifyLogin` / `requestLogout` | Renderer→Main | 登录/登出通知 |
| 设置 | `getSettings` / `setLoginAtStartup` 等 | Renderer↔Main | 桌面设置 |
| 更新 | `checkForUpdates` / `downloadUpdate` / `installUpdate` | Renderer↔Main | 自动更新 |
| 拖拽 | `startDrag` / `moveDrag` / `endDrag` | Renderer→Main | 桌宠拖拽 |
| 事件推送 | `onLogin` / `onLogout` / `onAccessTokenRefresh` / `onSettingsChange` 等 | Main→Renderer | 主进程事件回调 |

---

## 六、共享类型系统

`@xiaoelong/shared` 是前后端的类型契约中心，位于 `shared/src/index.ts`（~400 行），定义：

- **实体类型**：`UserProfile`, `ChatMessage`, `DailyQuestion`, `GomokuGame` 等
- **DTO 类型**：`AuthJoinResponse`, `ChatHistoryResponse`, `DailyQuestionTodayResponse` 等
- **Socket 事件类型**：`ServerToClientEvents`, `ClientToServerEvents`（含完整回调签名）
- **业务常量**：`MOOD_OPTIONS`（16 种心情 emoji）、`DEITY_CATALOG`（7 位神明）、`DEITY_RANKS`（5 级神阶）
- **工具函数**：`getDeityRank()`（根据膜拜次数计算神阶）

---

## 七、部署与构建

### 构建与发布

```
npm run build             → shared → server → client（Vite）
npm run server:deploy     → 定向清理并构建 shared+server，再打包 deploy/XiaoELong-server-<版本>.zip
npm run electron:dist     → Windows NSIS 安装包
npm run electron:dist:mac → macOS DMG + ZIP（universal）
```

`npm run clean` 只清理源码构建产物、Electron `release` 和本地构建缓存，不删除 `deploy/` 下已有的服务器 ZIP。`server:deploy` 在 Windows 使用 PowerShell/.NET，在 macOS/Linux 使用 `zip`；新包先写入同目录临时文件，成功后才替换正式包。

### 部署架构

```
用户电脑                          远程服务器 (43.139.223.204)
┌──────────────────┐             ┌──────────────────────────┐
│ Electron 客户端   │             │ Node.js 服务 (port 3001)  │
│ (内置 server 可选) │── HTTP* ───→│ - Express REST API       │
│                  │             │ - Socket.io              │
│ 自动更新检查 ─────┼────────────→│ - /updates/ 静态目录     │
│                  │             │   (latest.yml, .exe)     │
└──────────────────┘             │                          │
                                 │ MySQL 8.0                │
                                 └──────────────────────────┘
```

\* 当前公网域名尚未备案，生产环境暂时使用 HTTP；这是已知并接受的部署风险，待备案与可信域名具备后再迁移 HTTPS。

- 桌面客户端可选内嵌后端服务（`XIAOELONG_EMBEDDED_SERVER=1`）
- Windows 使用 electron-updater 自动更新（generic provider）
- macOS 使用手动 DMG 更新（GitHub Release + `latest-mac.json` 清单）

---

## 八、项目架构评估与优化建议

### 8.1 架构优点

| 方面 | 评价 |
|------|------|
| **类型安全** | shared 包提供了前后端类型契约，Socket 事件有完整类型推导 |
| **分层清晰** | Routes → Services → DB 三层分离，业务逻辑可独立测试 |
| **安全防护** | JWT 认证、sanitize-html 防 XSS、multer 文件类型校验、zod 输入校验 |
| **并发安全** | 五子棋落子与撤回使用数据库行锁 + 事务保证并发正确性 |
| **容错设计** | DeepSeek 失败自动 fallback 到本地题库；面板渲染崩溃自动恢复；Socket 断线提示并在恢复后合并补拉聊天记录 |
| **防闪烁** | 窗口采用 stage → reveal 两阶段显示；五子棋与每日一题刷新保留旧内容并稳定展示进度 |
| **幂等迁移** | 数据库 SQL 使用条件式 DDL，支持安全重复执行 |

### 8.2 优化建议

#### 高优先级

1. ✅ **App.tsx 过于庞大（已解决）**
   - 原问题：30+ 个 useState 集中在单一组件（~1740 行），逻辑耦合度高
   - 已处理：重构为 6 个 Context + useReducer，`App.tsx` 缩减至 73 行入口式路由；前端测试增至 310 条用例

2. **缺少后端测试**
   - 问题：后端（server）完全无自动化测试，核心业务 `GomokuService`、`DailyQuestionService` 未被测试覆盖
   - 建议：为核心业务逻辑添加单元测试；为关键 API（auth、chat）添加集成测试

3. **数据库迁移方式不够规范**
   - 问题：`init.sql` 中使用大量条件式 `ALTER TABLE` 实现渐进式迁移，耦合在初始化脚本中
   - 建议：考虑引入轻量级迁移工具或至少将迁移与初始化分离；当前方式在小项目也可接受，但条件式迁移会持续增加 `init.sql` 体积

#### 中优先级

4. **Socket 事件缺少服务端限流**
   - 问题：`chat:send`、`gomoku:move` 和 `gomoku:undo` 没有频率限制，可能被恶意高频调用
   - 建议：对消息发送、落子和撤回操作增加简单的内存限流（如每秒最多 N 次）

5. **日志系统不统一**
   - 问题：使用 `console.log`/`console.error` 直接输出，无结构化日志、无日志级别、无持久化
   - 建议：引入轻量级日志库（如 pino），支持日志级别和文件输出

6. **前端 API 层无请求去重/取消**
   - 问题：快速切换 tab 可能触发重复请求，旧请求结果可能覆盖新数据
   - 建议：在 `api.ts` 中使用 AbortController 支持请求取消；对 `loadDailyQuestion` 等轮询方法加版本号防竞态

#### 低优先级

7. **配置文件分散**
   - 问题：环境变量定义在 `server/.env`、`client/.env`、`electron/main.js` 硬编码默认值中
   - 建议：集中到根目录 `.env` 或统一的 config 模块

8. **Electron main.js 过长（1933 行）**
   - 问题：窗口管理、IPC 处理、更新逻辑全部在一个文件中
   - 建议：拆分为 `window-manager.js`、`ipc-handlers.js`、`updater.js` 等模块

9. **图片/文件上传无去重**
   - 问题：同一张图片可以被多次上传，产生多份存储
   - 建议：对上传文件计算 hash，已存在的文件直接返回已有 URL

10. **缺少 API 文档**
    - 问题：README 中有接口列表但无请求/响应示例
    - 建议：考虑使用 OpenAPI/Swagger 或至少补充 Markdown 格式的 API 文档

### 8.3 架构评分卡

| 维度 | 评分 | 说明 |
|------|------|------|
| 代码组织 | ⭐⭐⭐⭐ | monorepo 结构合理，分层清晰 |
| 类型安全 | ⭐⭐⭐⭐⭐ | shared 包 + TypeScript 全覆盖 |
| 安全性 | ⭐⭐⭐⭐ | JWT + XSS 防护 + 输入校验完善 |
| 可测试性 | ⭐⭐⭐⭐ | 前端 310 条用例覆盖 Context/组件/工具；后端无测试 |
| 可维护性 | ⭐⭐⭐⭐ | 前端已拆分为 Context + 三层组件；electron/main.js（~1933行）仍偏大 |
| 可扩展性 | ⭐⭐⭐ | Service 层设计良好，但前端状态管理缺少抽象 |
| 运维友好 | ⭐⭐⭐ | Docker 开发环境、GitHub Actions CI，但日志和监控欠缺 |
