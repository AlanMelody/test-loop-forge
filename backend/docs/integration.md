# 前后端联调说明（接口契约澄清）

共同契约未作任何变更。以下为实现锁定项与前端需要遵循的操作口径。

## HTTP

| 方法 | 路径 | 认证 | 成功响应 |
| --- | --- | --- | --- |
| POST | `/sessions` | 否 | `200 {user:{id,username,role}}`，设置 HttpOnly Cookie |
| DELETE | `/sessions` | 是 | `204`，无 body |
| GET | `/requirements` | 是 | `{items:[{id,title,status,version}]}` |
| POST | `/requirements` | 是 | `200 {id,title,status,version}` |
| GET | `/requirements/:id` | 是 | 完整详情（见下） |
| GET | `/requirements/:id/comments` | 是 | `{items:[{id,author:{id,role},content,createdAt}]}` |
| POST | `/requirements/:id/comments` | 是 | `{id,author:{id,role},content,createdAt}` |
| POST | `/requirements/:id/generations` | 是 | `{id,section,content,status,documentVersion}` |
| POST | `/requirements/:id/reviews` | 是 | `{id,title,status,version}` |

- `GET /requirements/:id` 的 `members` 元素为 `{id,username,role}`；`document` 为 `{id,sections:{prd,technical,frontend,tests}}`；`generation` 为当前状态对应章节的最新草稿 `{id,section,content,status,documentVersion}` 或 `null`；`transitions` 按时间升序，元素含 `id/fromStatus/toStatus/decision/reason/generationId/actor{id,role}/fromVersion/toVersion/createdAt`。
- `generation.status` 取 `draft | approved | rejected | superseded`。
- 错误统一 `{error:{code,message}}`：`401` 未登录/密码错误，`403` 非责任角色，`409` 版本冲突（含并发审批与草稿过期），`422` 参数非法/打回无理由/`done` 后审核/未知需求 ID。不使用契约外的 404。
- 创建需求返回 `200`（非 201）；四成员由服务端按固定账号自动写入，请求体只需 `{title}`。

## 状态机与章节映射（实现锁定项）

| 当前状态 | 责任角色 | 章节 | 通过 | 打回 |
| --- | --- | --- | --- | --- |
| draft | pm | prd | confirmed | draft |
| confirmed | pm | prd | design | draft |
| design | backend | technical | development | confirmed |
| development | frontend | frontend | testing | design |
| testing | test | tests | done | development |
| done | — | — | 422 | 422 |

打回理由必填（trim 后非空）；审核须携带当前章节的 `generationId` 与 `expectedVersion`。

## 两条版本线

- `version`（`requirements.version`）：业务状态版本，创建为 1，**仅审核成功 +1**。评论、Yjs 编辑、生成草稿均不改变它。用于 `expectedVersion` 与 `requirement.updated` 事件。
- `documentVersion`（`documents.version`）：Yjs 文档版本，每次持久化 update +1；`generation.documentVersion` 记录草稿生成时的文档版本。审核时若文档版本已变化返回 409，前端需重新生成草稿。

操作口径：先 `GET /requirements/:id`，再用返回的 `version` 调生成/审核；遇到 409 重新读取详情。

## WebSocket

- `/collaboration?requirementId=<uuid>`：Cookie 会话认证 + 四成员校验；不通过时 upgrade 返回 401/403。标准 y-websocket 线协议（外层 0=sync，1=awareness；sync 内层 0=step1，1=step2，2=update）。四章节是根级 `Y.Text`，名称 `prd`/`technical`/`frontend`/`tests`。断线重连先发 syncStep1，服务端回送全量状态；服务重启后从数据库快照+增量恢复。
- `/events`：Cookie 会话认证；服务端单向推送 `{type:'requirement.updated'|'comment.created',requirementId,version,data}`，不回放。断线重连后前端必须重新 GET 看板/评论。

## 幂等与并发

- `POST /generations` 的 `idempotencyKey` 在需求内唯一；重复键且 `expectedVersion` 相同返回原结果，不同返回 409。
- 同一章节新草稿会把旧 `draft` 标为 `superseded`；审核只接受当前章节的最新 draft。
- 审核在单事务中 `SELECT ... FOR UPDATE` + 条件 `UPDATE ... WHERE version=expectedVersion`，并发请求只有一个成功，其余 409。
