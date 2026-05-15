# XiaoELong MVP（Phase1+2）实施计划（含 README 评审）

## Summary
- README 总体可行，无致命架构问题，可以开工。
- 开工前需补齐 4 个关键缺口：
  - 身份安全：`localStorage userId` 可伪造，改为“邀请码入群后服务端签发 JWT”。
  - Socket 信任边界：不再从事件体接收 `userId`，统一从握手 token 解出身份。
  - 接口契约缺失：补齐入群、会话恢复、历史消息 API 与事件 payload。
  - 资源与索引：头像落服务器目录，补聊天查询索引和输入约束。
- 首期范围锁定为 Phase1+2：入群、在线状态、实时聊天；DailyQuestion/Gomoku/Electron 延后。

## Implementation Changes
- 工程组织
  - 建立 `client` + `server` + `shared`（共享类型）结构，前后端都用 TypeScript。
  - 本地开发使用 Docker MySQL（MySQL 8），提供初始化脚本。
- 用户入群与鉴权
  - `POST /api/auth/join`：校验邀请码、上传头像、创建用户、返回 `accessToken` + `profile`。
  - `GET /api/auth/me`：基于 Bearer token 返回当前用户，支持冷启动自动登录。
  - 客户端只保存 token，不再把 `userId` 作为可信来源。
- 在线状态与 Socket
  - Socket 握手校验 JWT，失败拒绝连接。
  - 服务端维护 `userId -> socketCount`，支持同用户多窗口在线不误判离线。
  - 事件采用：`presence:init`、`presence:online`、`presence:offline`。
- 实时聊天
  - `GET /api/chat/messages?limit=50` 返回最近消息。
  - `chat:send` 仅接收 `content`，服务端写库后广播 `chat:message`（含用户、时间、消息 id）。
  - 增加输入校验：空白拦截、长度上限、基础 XSS 过滤。
- 数据库与静态资源
  - `users.avatar_url` 存头像访问路径。
  - `messages` 增加 `(created_at)` 与 `(user_id, created_at)` 索引。
  - 头像文件落 `server/uploads/avatars`，通过静态路由访问。

## Public Interfaces
- REST
  - `POST /api/auth/join` 请求：`inviteCode`, `nickname`, `avatar(file)`；响应：`accessToken`, `user`。
  - `GET /api/auth/me` 响应：`user`。
  - `GET /api/chat/messages?limit=` 响应：消息数组（`id/user/content/createdAt`）。
- Socket
  - 握手：`auth.token` 必填。
  - 客户端到服务端：`chat:send { content }`。
  - 服务端到客户端：`presence:init`、`presence:online`、`presence:offline`、`chat:message`。

## Test Plan
- 鉴权与入群
  - 邀请码正确可入群并获取 JWT；错误邀请码返回 401。
  - 无 token 或伪造 token 的 Socket 连接被拒绝。
- 在线状态
  - 同用户多连接时，断开单连接不下线；最后一个连接断开才下线。
  - 新连接用户收到准确的 `presence:init`。
- 聊天
  - 消息发送后成功入库并广播给在线成员。
  - 历史消息接口稳定返回最近 50 条，顺序正确。
  - 非法消息（空字符串、超长）被拒绝且不入库。
- 头像上传
  - 仅允许图片类型与大小上限；上传后 URL 可访问。

## Assumptions
- 包管理器默认 `npm`。
- 开发环境使用 Docker MySQL，生产环境后续切腾讯云 MySQL。
- 头像先存服务器本地目录，后续可迁移到 COS。
- JWT 先采用长效 token（如 30 天）满足小群 MVP，刷新机制后续补充。
