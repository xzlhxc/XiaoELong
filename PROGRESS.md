# XiaoELong Development Progress

- Phase 1: Done
- Phase 2: Done
- Phase 3: Done
- Phase 4: Done
- Phase 5: Done
- Phase 6: In Progress

## 2026-04-11 16:30 (Iteration 1)

### 本次完成
- 完成 `README.md` 架构审阅，确认整体方案可行且可按 Phase1+2 启动。
- 锁定 MVP 关键决策：全 TypeScript、JWT 鉴权、头像落服务器本地目录、开发库使用 Docker MySQL。

### 验证结果
- 通过：需求与技术方向已和用户确认一致。
- 未执行：代码层验证（此轮为架构与方案确认阶段）。

### 未完成/阻塞
- 无

### 下一步
- 搭建 `client/server/shared` 代码骨架与基础配置。
- 落地入群鉴权、在线状态、实时聊天的最小可运行实现。

## 2026-04-11 18:10 (Iteration 2)

### 本次完成
- 完成 monorepo 工程落地：`client`、`server`、`shared` 三包结构，根目录脚本与 `docker-compose.yml`。
- 完成服务端 MVP：`POST /api/auth/join`、`GET /api/auth/me`、`GET /api/chat/messages`、JWT 鉴权中间件、头像上传与静态资源访问。
- 完成 Socket MVP：握手 token 校验、`presence:init`/`presence:online`/`presence:offline`、`chat:send` -> 入库 -> `chat:message` 广播。
- 完成数据库初始化脚本与表结构（`users`、`messages`），并在 `messages` 中补齐时间相关索引。
- 完成前端 MVP 页面：入群表单、会话恢复、在线状态栏、实时聊天面板与消息发送 ACK 处理。

### 验证结果
- 通过：`npm.cmd run build`（shared/server/client 全部构建成功）。
- 通过：专项 Socket 校验 `PRESENCE_DELTA_USER_OK=true`（`presence:online` 包含新上线用户资料）。
- 未通过：`npm.cmd run db:init`（`ECONNREFUSED 127.0.0.1:3306`，本地 MySQL 容器未启动）。

### 未完成/阻塞
- 无阻塞，待进行运行态联调。

### 下一步
- 启动 MySQL（Docker）并执行 `npm run db:init`，完成端到端联调。
- 增加接口与 Socket 的自动化测试用例（鉴权、在线状态、多连接、聊天发送）。

## 2026-04-14 14:30 (Iteration 3)

### 本次完成
- 完成本地 MySQL 运行态复核：`xiaoelong-mysql` 容器已启动并映射 `3306` 端口。
- 完成数据库初始化验证：`npm run db:init` 执行成功（`Database initialized successfully.`）。
- 完成数据表存在性校验：`XiaoELong` 库内已存在 `users`、`messages` 表。

### 验证结果
- 通过：`docker compose -p xiaoelong ps` 显示 `mysql` 服务状态为 `Up`。
- 通过：`npm run db:init` 成功。
- 通过：容器内执行 `SHOW TABLES;` 返回 `users`、`messages`。

### 未完成/阻塞
- 当前 WSL 普通用户对 `/var/run/docker.sock` 仍有权限限制；需要 `sudo` 或 root 执行 docker 命令。

### 下一步
- 修复 WSL 普通用户 Docker 权限（加入 `docker` 组后重新登录会话）。
- 启动 `dev:server` 与 `dev:client` 做端到端手工联调（入群、在线状态、聊天收发）。

## 2026-04-14 14:39 (Iteration 4)

### 本次完成
- 完成 Phase1+2 自动化本地验收脚本执行（健康检查、入群、鉴权、历史消息、Socket 连接、消息发送与广播）。
- 验证两名测试用户可正常通过邀请码注册并获取 JWT。
- 验证 `chat:send` ACK 返回成功，且另一客户端收到 `chat:message` 广播。

### 验证结果
- 通过：`HEALTH_OK=true`
- 通过：`JOIN_A_OK=true`、`JOIN_B_OK=true`
- 通过：`ME_OK=true`、`HISTORY_OK=true`
- 通过：`SOCKET_INIT_A=true`、`SOCKET_INIT_B=true`
- 通过：`CHAT_ACK_OK=true`、`CHAT_BROADCAST_OK=true`

### 未完成/阻塞
- 无阻塞；当前需继续补充边界场景与回归测试（例如“新用户在他人在线期间入群”的前端状态同步）。

### 下一步
- 执行手工 UI 验收清单，确认交互细节（头像、错误提示、断线重连体验）。
- 针对在线状态与鉴权增加自动化测试用例，覆盖边界场景。

## 2026-04-14 14:45 (Iteration 5)

### 本次完成
- 修复在线状态增量同步缺口：`presence:online` 事件增加 `user` 载荷，前端在未知用户上线时会自动加入状态列表。
- 修复服务端弱默认配置问题：`INVITE_CODE` 与 `JWT_SECRET` 改为必填，不再使用内置默认值。
- 拆分数据库初始化配置：新增 `db-env`，使 `npm run db:init` 仅依赖数据库参数，不受鉴权参数限制。
- 更新 README 使用说明：明确网页端通过 `http://localhost:5173` 访问，不直接打开 `client/index.html`。

### 验证结果
- 通过：`npm.cmd run build`（shared/server/client 全部构建成功）。

### 未完成/阻塞
- 无阻塞；运行服务前需要确保 `server/.env` 中已配置 `INVITE_CODE` 与 `JWT_SECRET`。

### 下一步
- 用两个浏览器会话进行手工联调，确认“新用户后加入时状态栏即时出现”行为。
- 继续补充 Phase1/2 自动化测试（鉴权与在线状态边界场景）。

## 2026-04-14 15:42 (Iteration 6)

### 本次完成
- 完成 Phase3：新增每日问题数据库结构、`DailyQuestionService`、`RSS + Provider` 题目生成链路、定时任务、失败兜底（复用最近成功题目或默认题）。
- 完成 Phase3 接口与事件：`GET /api/daily-question/today`、`POST /api/daily-question/answer`、`GET /api/daily-question/stats`，并实现 `question:update` 广播。
- 完成 Phase4：新增 `gomoku_games` / `gomoku_moves`，实现并行多局邀请、接受、落子、胜负判定与回合校验。
- 完成 Phase4 接口与事件：`GET /api/gomoku/games`、`POST /api/gomoku/invite`、`POST /api/gomoku/accept`、`POST /api/gomoku/move`，并实现 `gomoku:invite/accept/move` 与 `gomoku:update/end`。
- 完成 Phase5：前端重构为 Avatar 常驻 + 面板展开/收起壳层，整合 Chat / DailyQuestion / Gomoku / StatusBar 模块。
- 完成 Phase6 首版代码落地：新增 `electron/main.js`、`electron/preload.js`、桌面脚本与打包配置，支持开机自启与边缘隐藏策略。
- 更新依赖与脚本：新增 `node-cron`、`rss-parser`、Electron 相关工具链与桌面构建脚本。

### 验证结果
- 通过：`npm.cmd run build`（shared/server/client 全部构建成功）。
- 通过：`npm run db:init`（数据库初始化成功，包含新增表）。
- 通过：端到端 API 验证 `DAILY_TODAY_OK=true`、`DAILY_ANSWER_OK=true`、`GOMOKU_INVITE_OK=true`、`GOMOKU_ACCEPT_OK=true`、`GOMOKU_MOVE_OK=true`。
- 未通过：`npm run electron:pack`（外网下载 Electron 二进制超时，网络依赖阻塞打包产物生成）。

### 未完成/阻塞
- Phase6 打包阻塞：当前环境无法访问 GitHub Electron 发布资源，导致 `win-unpacked` 未生成。

### 下一步
- 在可访问 GitHub 或配置 Electron 镜像源的网络环境下重跑 `npm run electron:pack` 产出 `release/win-unpacked`。
- 执行手工 UI 回归（模块切换、每日问题答题反馈、五子棋并行多局）。

## 2026-04-14 16:03 (Iteration 7)

### 本次完成
- 配置并验证 Electron 镜像源下载：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`。
- 修复 Electron 打包阻塞：在 `build.win` 中设置 `signAndEditExecutable=false`，规避 `winCodeSign` 符号链接权限问题。
- 成功完成桌面包输出：`npm run electron:pack` 生成 `release/win-unpacked`。

### 验证结果
- 通过：Electron 主包从镜像源下载（日志显示 `npmmirror`/`cdn.npmmirror`）。
- 通过：`release/win-unpacked/XiaoELong.exe` 已生成。

### 未完成/阻塞
- 无阻塞；当前仍为无安装器目录包（符合本阶段目标）。

### 下一步
- 在本机直接运行 `release/win-unpacked/XiaoELong.exe` 做桌面端行为验收（开机自启、边缘隐藏、模块可用性）。

## 2026-07-05 19:10 (Iteration 8)

### 本次完成
- 安装并启动 Docker Desktop，拉起 `xiaoelong-mysql` MySQL 8 容器。
- 创建本地开发 `.env`，本地测试邀请码为 `123456`，并完成 `npm run db:init`。
- 生成一版 Q 版“小鳄龙”测试形象，处理为透明 PNG，并接入 `AvatarDock`。
- 调整桌面端交互：登录后默认只显示小鳄龙图标，点击后展开功能面板。
- 增加 Electron 运行时透明背景标记，避免桌面端出现整块网页背景。
- 修复打包版内置服务端启动方式与 CORS 来源配置，使 `file://` 前端可访问本地服务端。
- 重新生成 `release/win-unpacked/XiaoELong.exe` 目录包。

### 验证结果
- 通过：`npm.cmd run build`。
- 通过：`npm.cmd run electron:pack`。
- 通过：网页端入群、聊天、每日问题答题、五子棋邀请创建。
- 通过：启动 `release/win-unpacked/XiaoELong.exe` 后，`http://localhost:3001/health` 返回 `{ "ok": true }`。

### 未完成/阻塞
- 暂未做正式安装器；当前仍是 `win-unpacked` 目录包。
- 形象为测试版，后续可替换为正式角色资产。

### 下一步
- 手工体验桌面窗口的透明显示、点击展开/收起、拖拽边缘隐藏。
- 需要正式分发时，再补安装器、图标、开机自启配置确认和依赖安全升级。

## 2026-07-05 19:16 (Iteration 9)

### 本次完成
- 修复 Electron 打包版只显示任务栏图标、窗口内容透明空白的问题。
- 原因：Vite 默认产物使用 `/assets/...` 绝对路径，Electron 通过 `file://` 加载时找不到 JS/CSS。
- 处理：在 `client/vite.config.ts` 中设置 `base: "./"`，使打包产物使用相对资源路径。
- 重新生成 `release/win-unpacked` 目录包。

### 验证结果
- 通过：`release/win-unpacked/resources/app/client/dist/index.html` 中资源路径已变为 `./assets/...`。
- 通过：重新启动打包版后窗口内容可显示。

### 未完成/阻塞
- 无。

### 下一步
- 继续手工体验桌面端点击展开、收起、拖拽边缘隐藏。

## 2026-07-05 19:30 (Iteration 10)

### 本次完成
- 去掉初始入群/登录卡片的外圈边框，弱化外层阴影。
- 将桌面端登录后的默认状态改为仅显示小鳄龙形象，不再显示外框、“展开”或“小鳄龙”文字。
- 增加 Electron 窗口模式：登录态居中；收起态右下角小窗口；展开态右下角宽面板。
- 实现小鳄龙形象拖拽移动窗口，单击形象展开/收起。
- 调整桌面端展开面板：宽度加大、字号减小、页面层不出现上下滚动条，整体更轻量。

### 验证结果
- 通过：`npm.cmd run build`。
- 通过：`npm.cmd run electron:pack`。
- 通过：启动 `release/win-unpacked/XiaoELong.exe` 后，服务端健康检查返回 `{ "ok": true }`。

### 未完成/阻塞
- 当前仍是目录包；正式分发前还需要安装器和应用图标。

### 下一步
- 手工确认登录后收起态的位置、拖动手感、点击展开后的面板尺寸是否舒服。

## 2026-07-05 19:39 (Iteration 11)

### 本次完成
- 修复长按/拖动时窗口容易向右下偏移的问题：Electron 现在以“小鳄龙小窗”作为拖拽锚点，而不是以展开后的整块窗口作为偏移基准。
- 去掉桌面端左右边缘自动吸附/隐藏逻辑，避免拖动或聚焦时窗口自行跳动。
- 展开面板改为根据小鳄龙所在屏幕象限自动选择方向：`upper-left`、`upper-right`、`lower-left`、`lower-right`。
- 前端新增桌面方向状态接收逻辑，并通过 CSS 将面板摆到小鳄龙的左上、右上、左下或右下。
- 重新生成 `release/win-unpacked/XiaoELong.exe`。

### 验证结果
- 通过：`npm.cmd run build`。
- 通过：`npm.cmd run electron:pack`。
- 通过：重启 `release/win-unpacked/XiaoELong.exe` 后，`http://localhost:3001/health` 返回 `ok: true`。
- 通过：折叠态窗口约为 `180x190`，点击右下角小鳄龙后展开为 `860x620`，并保持小鳄龙位置不变，面板自动向左上展开。

### 下一步
- 手工体验四个屏幕区域的拖动与展开方向切换；如某个角落距离边缘仍不舒服，再微调窗口尺寸和面板间距。

## 2026-07-05 20:09 (Iteration 12)

### 本次完成
- 重设计桌面展开面板为「小鳄龙之家」：实体白色面板、轻阴影、清爽绿色主色，移除问候语和重复在线人数。
- 成员在线状态改为紧凑头像条，仅显示头像、状态点、昵称和本人标记。
- 重做聊天面板视觉：更轻的气泡、输入栏和隐藏式细滚动条。
- 扩展每日问题统计：`DailyQuestionStats` 新增 `voters`，服务端通过 `daily_answers` 关联 `users` 返回每个选项的选择成员。
- 每日问题答题前只显示选项；答题后显示票数、比例和每个选项下的选择成员。
- 五子棋邀请改为原位弹出成员选择浮层，包含全部成员，离线成员弱化显示。
- 重新生成并启动 `release/win-unpacked/XiaoELong.exe`。

### 验证结果
- 通过：`npm.cmd run build`。
- 通过：`npm.cmd run electron:pack`。
- 通过：打包版服务健康检查返回 `ok: true`。
- 通过：打包服务端产物包含新的每日问题 `voters` 查询。
- 通过：打包前端产物包含「小鳄龙之家」「选择成员」等新版 UI 文案。
- 通过：桌面端折叠态仍为 `180x190`，展开态仍按原四象限窗口逻辑打开。
- 已做视觉抽查：展开面板无半透明延展背景框，仅显示实体白色面板。

### 下一步
- 手工用两个真实成员验证每日问题投票人列表的实时刷新。
- 继续根据实际使用手感微调面板宽度、五子棋棋盘尺寸和成员浮层位置。

## 2026-07-05 23:59 (Iteration 13)

### 本次完成
- 登录页增加实体背景，桌面运行时不再让登录状态显示为透明窗口。
- 登录页头像上传控件改为自定义样式，隐藏原生文件选择按钮，并显示所选文件名。
- 修复高 DPI 缩放下展开面板被右侧窗口边界裁切的问题：展开窗口宽度调整为 `1200`，面板改为根据左右 inset 自动计算宽度。
- 面板继续保留小鳄龙侧边区域，不再使用固定 `660px` 硬塞进高缩放窗口。
- 重新生成并启动 `release/win-unpacked/XiaoELong.exe`。

### 验证结果
- 通过：`npm.cmd run build`。
- 通过：`npm.cmd run electron:pack`。
- 通过：打包版服务健康检查返回 `ok: true`。
- 通过：桌面端展开截图确认主面板横向内容已完整显示，不再只露出左半边。

### 下一步
- 用户手工确认登录页头像上传控件和展开面板边缘是否符合预期；如仍觉得外层透明区域影响使用，再考虑拆分为“小鳄龙窗口 + 面板窗口”的双窗口结构。

## 2026-07-06 00:42 (Iteration 14)

### 本次完成
- 将桌面端拆成三个 Electron 角色窗口：登录窗口、`avatar` 小鳄龙窗口、`panel` 展开面板窗口。
- 收起态只保留约 `182x193` 的小鳄龙透明窗口；展开后额外显示独立 `560x560` 面板窗口，避免旧版大透明区域挡住桌面点击。
- 面板窗口改为铺满自己的独立窗口，不再使用旧单窗口时代的左右 inset 和半透明延展区域。
- 成员头像状态条改为自动换行，超过宽度后进入下一行，并限制高度，用户变多时不再横向撑宽面板。
- 隐藏的登录窗口不再建立实时 socket；小鳄龙窗口保持在线，面板窗口负责聊天、每日问题、五子棋内容。
- 清理数据库测试用户，仅保留最新用户 `HJC`（id: `a1b2472b-89de-4ff9-bc99-c51914070bc0`）。

### 验证结果
- 通过：`npm.cmd run build`。
- 通过：`npm.cmd run electron:pack`，已更新 `release/win-unpacked/XiaoELong.exe`。
- 通过：启动桌面版后 `http://127.0.0.1:3001/health` 返回 `ok: true`。
- 通过：窗口枚举显示收起态可见窗口约 `182x193`；点击小鳄龙后出现独立面板窗口 `560x560`。
- 通过：数据库 `users` 表当前仅剩 `HJC`。

### 后续自助清理命令
- 查看用户：
  `docker exec xiaoelong-mysql mysql -uxiaoelong -pxiaoelong XiaoELong -e "SELECT id,nickname,created_at FROM users ORDER BY created_at DESC;"`
- 只保留某个用户，删除其他测试用户：
  `docker exec xiaoelong-mysql mysql -uxiaoelong -pxiaoelong XiaoELong -e "DELETE FROM users WHERE id <> '<要保留的用户id>';"`

### 下一步
- 手工确认展开面板的视觉密度、成员换行、五子棋布局是否符合使用手感；如仍觉得宽，可继续把面板宽度从 `560` 微调到 `520` 左右。

## 2026-07-06 01:02 (Iteration 15)

### 本次完成
- 修复聊天输入区发送按钮换行问题：发送按钮固定宽度并禁止文字换行，`发送` / `发送中` 都保持单行。
- 为聊天列表、成员列表、每日问题结果、五子棋列表、邀请成员浮层预留稳定滚动条槽位，滚动条显示/隐藏时不再把内容往左挤。
- 新增 Electron 系统托盘图标，使用现有小鳄龙 PNG 生成 `16x16` tray icon。
- 托盘菜单新增「显示小鳄龙」「隐藏」「退出」；点击托盘图标会恢复当前窗口模式。
- 登录窗口、小鳄龙窗口、面板窗口均设置为 `skipTaskbar: true`，改为通过系统托盘管理，不再常驻普通任务栏图标。

### 验证结果
- 通过：`npm.cmd run build`。
- 通过：`npm.cmd run electron:pack`，已更新 `release/win-unpacked/XiaoELong.exe`。
- 通过：启动桌面版后 `http://127.0.0.1:3001/health` 返回 `ok: true`。

### 下一步
- 手工确认 Windows 托盘区图标显示是否清晰；如小图标太糊，后续单独生成一版专用 `.ico` 或 `16x16/32x32` PNG。

## 2026-07-06 01:25 (Iteration 16)

### 本次完成
- 小鳄龙形象支持右键打开设置面板；左键仍打开原「小鳄龙之家」主面板。
- 新增 panel 视图状态：`home` 用于左键主面板，`settings` 用于右键设置面板，两者复用同一个独立面板窗口。
- 设置面板右上角新增按钮：隐藏小鳄龙、开机自启、置顶、退出登录。
- 「置顶」改为真实控制 Electron 面板窗口的 `alwaysOnTop`，左键主面板和右键设置面板共享同一个置顶状态。
- 「开机自启」改为可切换设置，不再在启动时强制打开，避免用户关闭后下次启动又被恢复。
- 「退出登录」通过 Electron 广播到所有渲染窗口，统一清除本地 token 并回到登录窗口。

### 验证结果
- 通过：`npm.cmd run build`。
- 通过：`npm.cmd run electron:pack`，已更新 `release/win-unpacked/XiaoELong.exe`。
- 通过：启动桌面版后 `http://127.0.0.1:3001/health` 返回 `ok: true`。
- 通过：收起态可见窗口约 `182x193`，右键小鳄龙后出现独立 `560x560` 设置面板窗口。

### 下一步
- 手工确认设置按钮在实际屏幕缩放下的排列是否舒服；如右上角显得拥挤，可以继续压缩按钮文案或改成图标按钮。

## 2026-07-06 01:42 (Iteration 17)

### 本次完成
- 右键设置面板改为独立小尺寸，不再复用左键主面板的 `560x560` 尺寸。
- 设置面板窗口尺寸调整为约 `380x172`，仅保留标题和设置按钮，移除额外用户资料块。
- 右键小鳄龙在设置面板已打开时会收回设置面板，只保留小鳄龙本体。
- 左键主面板切换改为显式 Electron IPC 控制，避免右键设置状态和左键主面板状态互相串台。
- 修正置顶控制对象：小鳄龙本体保持常驻，设置里的「置顶」只控制面板窗口。

### 验证结果
- 通过：`npm.cmd run build`。
- 通过：`npm.cmd run electron:pack`，已更新 `release/win-unpacked/XiaoELong.exe`。
- 通过：启动桌面版后 `http://127.0.0.1:3001/health` 返回 `ok: true`。
- 通过：右键打开设置面板为约 `380x172`；再次右键收回；左键仍打开约 `560x560` 主面板。

### 下一步
- 手工确认小设置面板按钮密度是否舒适；如果想更轻，可以继续把按钮改成图标+tooltip。

## 2026-07-06 01:55 (Iteration 18)

### 本次完成
- 修复桌面面板展开后左下/右下圆角外出现方形半透明背景的问题。
- 原因是桌面面板贴满透明 Electron 窗口时仍保留外投影，投影被矩形窗口边界裁切后在圆角外形成半透明方块感。
- 桌面 `panel` 窗口移除外投影，改为干净实体面板；保留圆角、边线和内部内容布局。
- 强化 panel 窗口透明裁剪：`html/body/#root/panel-page` 均明确透明，`panel-page` 使用圆角裁剪，避免根容器背景或抗锯齿区域漏出。

### 验证结果
- 通过：`npm.cmd run build`。
- 通过：`npm.cmd run electron:pack`，已更新 `release/win-unpacked/XiaoELong.exe`。
- 通过：启动桌面版后 `http://127.0.0.1:3001/health` 返回 `ok: true`。
- 通过：左键展开后主面板仍为约 `560x560`。

### 下一步
- 用户手工确认圆角外方形半透明底是否已完全消失；若 Windows 透明层仍有系统级残影，再考虑把窗口形状改为无圆角矩形或改用带内边距的阴影容器。

## 2026-07-06 02:14 (Iteration 19)

### 本次完成
- 修复桌面面板打开时先闪一下再出现的问题。
- Electron 主进程不再在 `ready-to-show` 后直接显示 panel 窗口，而是等待前端完成当前面板视图渲染后再 `show()`。
- 前端 panel 角色新增 `notifyPanelReady` 握手：当前用户、面板视图和当前 tab 准备好后，延迟两个动画帧通知主进程。
- 切换左键主页/右键设置时，如果视图变化，会先隐藏旧 panel 内容，等新视图渲染完成后再显示，避免旧内容闪现。

### 验证结果
- 通过：`npm.cmd run build`。
- 通过：`npm.cmd run electron:pack`，已更新 `release/win-unpacked/XiaoELong.exe`。
- 通过：启动桌面版后 `http://localhost:3001/health` 返回 `ok: true`。
- 通过：新版 `XiaoELong.exe` 进程已启动。

### 下一步
- 用户手工快速点几次左键展开/收回、右键设置/收回，确认主观闪烁感是否已经消失；如果仍能看到 Windows 级透明窗口残影，再继续加窗口 opacity 缓入或截图级定位。

## 2026-07-06 14:48 (Iteration 20)

### 本次完成
- 修复 Iteration 19 防闪握手导致左键/右键看起来无反应的问题。
- 原因是 panel 窗口等待前端 `panel-ready` 时没有兜底路径；一旦 ready 信号未及时返回，窗口会一直隐藏。
- 保留“前端 ready 后再显示”的防闪逻辑，同时新增 `700ms` 兜底计时器：ready 正常返回则立即显示；ready 未返回也会显示面板，避免点击被卡死。
- 在切换到登录/收起状态、panel 关闭、ready 返回时都会清理兜底计时器，避免隐藏后又被延迟显示。

### 验证结果
- 通过：`npm.cmd run build`。
- 通过：`npm.cmd run electron:pack`，已更新 `release/win-unpacked/XiaoELong.exe`。
- 通过：启动桌面版后 `http://localhost:3001/health` 返回 `ok: true`。
- 通过：系统窗口枚举确认小鳄龙本体为 `180x190`。
- 通过：模拟左键点击后出现 `560x560` 主面板。
- 通过：模拟右键点击后出现 `380x172` 设置面板。

### 下一步
- 用户手工确认左键/右键点击体感是否恢复；如果仍有偶发闪烁，再改为 panel 窗口先 `opacity: 0`，ready 后恢复透明度并显示。

## 2026-07-06 15:12 (Iteration 21)

### 本次完成
- 针对“点击不灵敏、仍然闪一下”的体感问题，替换 Iteration 20 的单纯兜底方案。
- 前端 panel ready 不再依赖隐藏窗口中的 `requestAnimationFrame`，改为 `useLayoutEffect` 在 React DOM 提交后立即通知主进程。
- Electron 关闭 `backgroundThrottling`，避免隐藏/后台窗口中的渲染和计时器被系统节流。
- 收起态会预热 panel 窗口：panel 保持 `opacity: 0`、鼠标穿透、后台加载完成；打开时只恢复 `opacity: 1` 和鼠标事件，不再频繁触发系统层面的 `hide/show`。
- panel ready 兜底从 `700ms` 降为 `150ms`，仅作为极端情况下的保险。

### 验证结果
- 通过：`npm.cmd run build`。
- 通过：`npm.cmd run electron:pack`，已更新 `release/win-unpacked/XiaoELong.exe`。
- 通过：启动桌面版后 `http://localhost:3001/health` 返回 `ok: true`。
- 通过：启动后可见小鳄龙本体约 `182x193`；panel 预热窗口存在但应为透明且鼠标穿透。

### 下一步
- 用户手工确认左键/右键打开是否恢复到接近即时；如果仍能看到闪烁，再继续改为完全常驻 panel 内容层，只通过 CSS 切换内容透明度。

## 2026-07-06 15:45 (Iteration 22)

### 本次完成
- 新增“每日心情”功能，固定选项为 `😊`、`😡`、`😞`、`😭`。
- 数据库新增 `daily_moods` 表，每个用户每个心情日仅保留一条记录；同日再次选择会覆盖更新。
- 心情日按 Asia/Shanghai 的早 8 点刷新规则计算：08:00 到次日 07:59 归为同一个心情日。
- 服务端新增 `/api/daily-mood/today` 和 `/api/daily-mood`，并通过 `mood:update` socket 事件实时广播更新。
- 在线状态 `PresenceUser` 扩展 `todayMood`，状态条会显示所有成员当天心情；点击自己的状态项可重新选择。
- 桌面 avatar 窗口在当前心情日未填写时，会在小鳄龙旁显示轻量心情气泡，选择后关闭气泡并记录。

### 验证结果
- 通过：`npm.cmd run db:init`，`daily_moods` 表已创建。
- 通过：`npm.cmd run build`。
- 通过：`npm.cmd run electron:pack`，已更新 `release/win-unpacked/XiaoELong.exe`。
- 通过：启动桌面版后 `http://localhost:3001/health` 返回 `ok: true`。
- 通过：`GET /api/daily-mood/today` 返回当前心情日、四个 emoji 选项，并在未填写时返回 `shouldPrompt: true`。

### 下一步
- 用户手工点击小鳄龙旁的心情气泡完成一次选择，确认状态条显示 emoji；再点击自己的状态项验证可修改。

## 2026-07-06 15:56 (Iteration 23)

### 本次完成
- 每日心情选项从 4 个扩展为 16 个：`😊`、`🥰`、`😌`、`😎`、`🥳`、`🤔`、`😐`、`😮‍💨`、`😴`、`😟`、`😞`、`😭`、`😡`、`😤`、`😱`、`🤒`。
- 小鳄龙旁的心情气泡标题改为「今日心情」，并重新设计为更轻的 4x4 emoji 网格。
- 去掉心情 emoji 按钮和状态栏心情 emoji 周围的框/底色，默认只显示居中的 emoji，hover/选中时才出现轻微底色。
- 取消鼠标悬停在自己的在线状态框上时出现的原生文字提示。

### 验证结果
- 通过：`npm.cmd run build`。
- 通过：`npm.cmd run electron:pack`，已更新 `release/win-unpacked/XiaoELong.exe`。
- 通过：启动桌面版后 `http://localhost:3001/health` 返回 `ok: true`。

### 下一步
- 用户手工确认 16 个 emoji 的气泡视觉是否足够简洁、居中；如仍挤，可继续把气泡改成 8x2 横向布局并适当扩大 avatar 窗口。
## 2026-07-06 16:20 (Iteration 24)

### 本次完成
- 修复状态栏心情选择浮层：点状态栏外的任意位置会关闭，按 `Esc` 也会关闭。
- 修复心情 emoji 圆形 hover/选中底色偏心问题：心情按钮使用专门尺寸、居中和字体规则，不再被桌面端通用按钮 padding 覆盖。
- 小鳄龙旁的每日心情面板和状态栏心情弹窗都改为包裹 `.mood-emoji`，让 emoji 在圆形区域内视觉更居中。
- 右键设置面板新增「预览心情」按钮：点击后可在小鳄龙旁显示每日心情面板；再次点击可收起预览。该操作不清空当天记录，只有点击 emoji 才会更新今日心情。
- 补充 Electron IPC：`desktop:mood-preview` 负责从设置面板通知 avatar 窗口显示/收起心情预览。

### 验证结果
- 通过：`npm.cmd run build`。
- 通过：`npm.cmd run electron:pack`，已更新 `release/win-unpacked/XiaoELong.exe`。
- 通过：启动桌面版后 `http://localhost:3001/health` 返回 `ok: true`。

### 下一步
- 用户手动确认状态栏心情弹窗外部点击关闭、emoji 圆形背景居中、以及右键设置里的「预览心情」是否符合预期。
## 2026-07-06 17:10 (Iteration 25)

### 本次完成
- 将「每日问题」重做为「每日一题」：中文四选一答题挑战，题目支持分类、正确答案和简短解析。
- 接入 DeepSeek 生成器配置：新增 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`，默认模型为 `deepseek-v4-flash`；真实 key 未写入代码、示例文件或进度记录。
- 移除新闻 RSS 题目生成路径；无 DeepSeek key 或 DeepSeek 调用失败时，使用本地中文题库 fallback。
- 每日一题刷新日改为 Asia/Shanghai 08:00，与每日心情一致：07:59 仍属于前一天，08:00 后进入新一天。
- 数据库 `daily_questions` 兼容新增 `category`、`correct_answer_index`、`explanation` 字段；旧题保留，旧题没有解析时不强行显示对错。
- 前端答题后显示答对/答错、正确答案、解析、投票比例和成员选择；未答题前不展示正确答案和解析。

### 验证结果
- 通过：`npm.cmd run db:init`，新字段已补齐。
- 通过：`npm.cmd run build`。
- 通过：fallback 题库生成脚本返回中文四选一题。
- 通过：08:00 刷新日脚本验证，上海 07:59 为前一天，08:00 为新一天。
- 通过：`npm.cmd run electron:pack`，已更新 `release/win-unpacked/XiaoELong.exe`。
- 通过：启动桌面版后 `http://localhost:3001/health` 返回 `ok: true`。
- 通过：`GET /api/daily-question/today` 不向未答题/旧题场景提前泄露正确答案。

### 下一步
- 用户手动确认明天 08:00 后新版「每日一题」的 UI 和题目风格；如需立即看新版题，可删除当天旧 `daily_questions` 记录后重新生成。
## 2026-07-06 23:20 (Iteration 26)

### 本次完成
- 每日一题顶部改为「每日一题 + 分类标签 + 日期」同一行；题目、选项、结果和统计统一放进滚动区。
- 每日一题滚动条复用聊天列表的细窄隐藏式样式，滚动区高度由模块内部撑满，不再只让统计区滚动。
- 缩小并约束五子棋棋盘：棋盘按右侧对局容器宽高自适应居中，避免超过对局容器。
- 右键设置面板改为一列按钮，Electron 设置窗口调整为更窄更高的纵向小面板。
- 心情面板改为显示在小鳄龙左侧；avatar 窗口仅在心情面板显示时临时扩宽，隐藏后恢复原尺寸。

### 验证结果
- 通过：`npm.cmd run build`。
- 通过：`npm.cmd run electron:pack`，已更新 `release/win-unpacked/XiaoELong.exe`。
- 通过：启动桌面版后 `http://localhost:3001/health` 返回 `ok: true`。
- 通过：确认 DeepSeek key 仅保留在本地忽略的 `.env` 文件中，未写入仓库内容。

### 下一步
- 用户手动确认每日一题滚动手感、五子棋棋盘尺寸、设置面板一列布局、心情面板左置位置是否符合预期。
## 2026-07-06 23:35 (Iteration 27)

### 本次完成
- 修复退出登录后重新输入邀请码/昵称，小鳄龙形象消失的问题。
- 原因：退出登录会让 auth/avatar/panel 三个渲染窗口都清空 React 登录态；重新登录时只有 auth 窗口拿到新 token，隐藏的 avatar 窗口没有重新读取 localStorage。
- 新增 Electron 登录同步 IPC：auth 窗口加入成功后广播 `desktop:login`，avatar/panel 收到后写入 token 并重新 bootstrap 会话。
- 保持现有退出登录逻辑不变，继续广播 `desktop:logout` 清空所有窗口会话。

### 验证结果
- 通过：`npm.cmd run build`。
- 通过：`npm.cmd run electron:pack`，已更新 `release/win-unpacked/XiaoELong.exe`。
- 通过：启动桌面版后 `http://localhost:3001/health` 返回 `ok: true`。
- 通过：确认 DeepSeek key 仅保留在本地忽略的 `.env` 文件中，未写入仓库内容。

### 下一步
- 用户手动验证退出登录后重新加入群组，小鳄龙形象是否会立即恢复显示。
## 2026-07-06 23:55 (Iteration 28)

### 本次完成
- 聊天列表新增底部感知：自己发消息后自动滚到底；用户正在浏览历史时，别人新消息不会打断滚动位置。
- 聊天输入框上方新增「有新消息 n 条」提示，点击后平滑滚动到底部并清空计数。
- 在线状态栏取消内部滚动条，成员多行时直接增加状态区高度，不再单独滚动。

### 验证结果
- 通过：`npm.cmd run build`。
- 通过：`npm.cmd run electron:pack`，已更新 `release/win-unpacked/XiaoELong.exe`。
- 通过：启动桌面版后 `http://localhost:3001/health` 返回 `ok: true`。
- 通过：确认 DeepSeek key 仅保留在本地忽略的 `.env` 文件中，未写入仓库内容。

### 下一步
- 用户手动验证聊天历史浏览时的新消息提示、发送后自动到底部、状态栏多行撑高是否符合预期。
