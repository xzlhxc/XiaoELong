# 小鳄龙 (XiaoELong) — 群组桌面伴侣

一个运行在 Windows 桌面上的私人小群组件，供固定的一群朋友日常互动使用。点击桌面上的群形象图，展开聊天、每日问题、小游戏等功能区。不用时可拖拽隐藏至屏幕边缘。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron |
| 前端 | React + Vite |
| 后端 | Node.js + Express + Socket.io |
| 数据库 | MySQL（腾讯云） |
| 服务器 | 腾讯云轻量应用服务器 |
| 进程管理 | PM2 |

> 开发阶段先做纯网页版跑通所有功能，最后阶段再套 Electron 壳。

---

## 项目结构

```
XiaoELong/
├── client/          # React 前端（Vite）
│   ├── src/
│   │   ├── components/
│   │   │   ├── Avatar/        # 群形象图及展开动画
│   │   │   ├── Chat/          # 实时聊天
│   │   │   ├── DailyQuestion/ # 每日问题
│   │   │   ├── Gomoku/        # 五子棋
│   │   │   └── StatusBar/     # 在线状态栏
│   │   ├── socket.js          # Socket.io 客户端实例
│   │   └── App.jsx
├── server/          # Node.js 后端
│   ├── index.js     # 入口，Express + Socket.io
│   ├── routes/      # REST API 路由
│   └── db.js        # MySQL 连接
├── electron/        # Electron 主进程（最后阶段加入）
│   └── main.js
└── README.md
```

---

## 用户系统

**不做账号注册登录。** 采用邀请码机制：

- 管理员预设一个固定邀请码
- 用户首次打开应用，输入邀请码 + 设置昵称 + 上传头像，即完成"入群"
- 身份信息（userId、昵称、头像）生成后存入数据库，同时缓存在本地 `localStorage`
- 后续打开应用自动读取本地身份，无需重复输入

---

## 数据库表结构

### users — 用户表
```sql
CREATE TABLE users (
  id          VARCHAR(36) PRIMARY KEY,  -- UUID
  nickname    VARCHAR(32) NOT NULL,
  avatar_url  VARCHAR(255),
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### messages — 聊天消息表
```sql
CREATE TABLE messages (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id     VARCHAR(36) NOT NULL,
  content     TEXT NOT NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### daily_questions — 每日问题表
```sql
CREATE TABLE daily_questions (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  date        DATE NOT NULL UNIQUE,
  question    TEXT NOT NULL,
  options     JSON NOT NULL  -- ["选项A", "选项B", "选项C", "选项D"]
);
```

### daily_answers — 每日问题回答表
```sql
CREATE TABLE daily_answers (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  question_id  INT NOT NULL,
  user_id      VARCHAR(36) NOT NULL,
  answer_index INT NOT NULL,  -- 0/1/2/3 对应选项
  answered_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_question_user (question_id, user_id),
  FOREIGN KEY (question_id) REFERENCES daily_questions(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

### gomoku_games — 五子棋对局表
```sql
CREATE TABLE gomoku_games (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  player_black VARCHAR(36) NOT NULL,  -- 先手（黑棋）用户 id
  player_white VARCHAR(36) NOT NULL,  -- 后手（白棋）用户 id
  board_state  JSON,                  -- 当前棋盘状态
  current_turn VARCHAR(36),           -- 当前轮到谁落子
  winner       VARCHAR(36),           -- NULL 表示未结束
  status       ENUM('waiting','playing','finished') DEFAULT 'waiting',
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (player_black) REFERENCES users(id),
  FOREIGN KEY (player_white) REFERENCES users(id)
);
```

---

## Socket.io 事件约定

所有用户在同一个房间 `room:main` 内通信。

### 连接 & 在线状态
| 事件名 | 方向 | 说明 |
|--------|------|------|
| `presence:init` | 服务端 → 客户端 | 初始成员在线状态列表 |
| `presence:online` | 服务端 → 所有客户端 | 广播某用户上线，附带在线列表 |
| `presence:offline` | 服务端 → 所有客户端 | 广播某用户下线，附带在线列表 |

### 实时聊天
| 事件名 | 方向 | 说明 |
|--------|------|------|
| `chat:send` | 客户端 → 服务端 | 发送消息，携带 content |
| `chat:message` | 服务端 → 所有客户端 | 广播新消息，附带用户信息和时间戳 |

### 每日问题
| 事件名 | 方向 | 说明 |
|--------|------|------|
| `question:update` | 服务端 → 所有客户端 | 广播最新答题统计（谁选了什么） |

### 五子棋
| 事件名 | 方向 | 说明 |
|--------|------|------|
| `gomoku:invite` | 客户端 → 服务端 | 邀请某用户对局，携带 targetUserId |
| `gomoku:accept` | 客户端 → 服务端 | 接受邀请，携带 gameId |
| `gomoku:move` | 客户端 → 服务端 | 落子，携带 gameId、row、col |
| `gomoku:update` | 服务端 → 对局相关客户端 | 广播最新对局状态 |
| `gomoku:end` | 服务端 → 对局相关客户端 | 广播对局结果，携带 winner |

---

## 功能模块说明

### 1. 群形象图（Avatar）
- 桌面上常驻显示一张群形象图（PNG，支持透明背景）
- 点击形象图后，以动画方式展开功能区面板
- 功能区包含：聊天、每日问题、五子棋、在线状态栏
- 再次点击形象图收起功能区

### 2. 在线状态栏（StatusBar）
- 展示所有群成员的头像和昵称
- 绿点 = 在线，灰点 = 离线
- 数据来源：Socket.io 连接状态，实时更新
- 位置：功能区顶部常驻显示

### 3. 实时聊天（Chat）
- 展示历史消息（从数据库加载最近 50 条）
- 实时接收和发送文字消息
- 每条消息显示：头像、昵称、内容、时间
- 自己发的消息显示在右侧，他人在左侧

### 4. 每日问题（DailyQuestion）
- 每天一道选择题（由管理员提前录入数据库，或后续做管理界面）
- 用户回答前只能看到题目和选项，看不到别人的选择
- 提交回答后，实时显示所有人的选择分布（类似投票结果图）
- 每人每天只能回答一次，刷新后保留已回答状态

### 5. 五子棋（Gomoku）
- 在在线状态栏点击某人头像，发起五子棋邀请
- 对方接受后开始对局，15×15 标准棋盘
- 异步回合制：不要求双方同时在线，落子后对方下次打开时可继续
- 实时模式：如果双方同时在线，落子后对方立即看到更新
- 胜负判定在服务端进行

---

## Electron 配置要点（最后阶段）

```js
// electron/main.js 关键配置
const win = new BrowserWindow({
  width: 360,
  height: 520,
  frame: false,          // 无边框，透明窗口
  transparent: true,     // 背景透明，形象图悬浮桌面
  alwaysOnTop: true,     // 桌面常驻
  resizable: false,
  skipTaskbar: false,
})

// 开机自启
app.setLoginItemSettings({ openAtLogin: true })
```

拖拽至屏幕边缘隐藏的逻辑：监听窗口 `move` 事件，当窗口边缘接近屏幕边缘时，以动画将窗口滑出屏幕，仅留出一小段可点击区域用于召回。

---

## 开发阶段规划

| 阶段 | 内容 |
|------|------|
| Phase 1 | 服务器环境搭建、数据库初始化、Socket.io 连通验证、用户入群流程 |
| Phase 2 | 在线状态栏 + 实时聊天 |
| Phase 3 | 每日问题模块 |
| Phase 4 | 五子棋模块 |
| Phase 5 | 群形象图 + 展开/收起动画、整体 UI 美化 |
| Phase 6 | Electron 打包、开机自启、边缘隐藏 |

---

## 环境变量（.env）

```
# 服务端 .env
PORT=3001
DB_HOST=your_db_host
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=XiaoELong
INVITE_CODE=your_invite_code
JWT_SECRET=your_jwt_secret
JWT_EXPIRES_IN=30d
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
QUESTION_CRON=0 0 * * *
QUESTION_TIMEZONE=Asia/Shanghai
QUESTION_RSS_FEEDS=https://rss.nytimes.com/services/xml/rss/nyt/World.xml,https://feeds.bbci.co.uk/news/world/rss.xml
QUESTION_HEADLINE_LIMIT=8

# 客户端 .env
VITE_SERVER_URL=http://your_server_ip:3001
```

> `.env` 文件不提交到 Git，在 `.gitignore` 中忽略。

---

## 当前实现状态（Phase1-Phase6）

已落地内容：
- `client` + `server` + `shared` Monorepo 结构（全 TypeScript）
- Phase1/2：入群鉴权、在线状态、实时聊天（REST + Socket）
- Phase3：每日问题（RSS + Provider 生成、定时任务、答题统计广播、失败兜底）
- Phase4：五子棋（并行多局、邀请/接受/落子、服务端判定胜负）
- Phase5：Avatar 常驻 + 面板展开/收起壳层，模块切换（Chat / Daily / Gomoku / StatusBar）
- Phase6（代码就绪）：Electron 主进程、开机自启、边缘隐藏逻辑、桌面构建脚本

---

## 快速启动（本地开发）

1. 安装依赖
```bash
npm install
```

2. 配置环境变量
- 复制 `server/.env.example` 为 `server/.env`
- 复制 `client/.env.example` 为 `client/.env`
- `server/.env` 至少配置：
  - `INVITE_CODE=...`
  - `JWT_SECRET=...`
  - 若启用 OpenAI 题目生成：`OPENAI_API_KEY=...`

3. 启动 MySQL（Docker）
```bash
docker compose -p xiaoelong up -d
```

4. 初始化数据库
```bash
npm run db:init
```

5. 启动服务端与前端
```bash
npm run dev:server
npm run dev:client
```

6. 打开网页端
- 在浏览器访问 `http://localhost:5173`
- 不要直接双击打开 `client/index.html`，该项目依赖 Vite 开发服务器与环境变量注入

7. （可选）桌面端开发与打包
```bash
# 联动启动 server + client + electron
npm run dev:desktop

# 生成桌面包（win-unpacked）
npm run electron:pack
```

---

## 进度记录

每次迭代的完成项、验证结果和下一步都写在根目录 `PROGRESS.md`。
