# 后端实现说明

工作项：`test-loop-forge-ai-collaboration-backend`；关联主需求 `issue-1795251395396375603`。
分支：`feature/requirement-3-20261121-0925`（基于 `main`）。改动仅位于 `backend/`，未触碰 `frontend/`，未合并或推送 `main`。

## 已实现范围

1. **工程与数据**：`backend/` 独立 Node.js 20+/TypeScript 工程；`pg` 连接池；`migrations/001_init.sql` 建 users/sessions/requirements/requirement_members/documents/document_updates/document_snapshots/comments/generations/transitions/schema_migrations；`npm run migrate` 幂等迁移；`npm run seed` 四账号 upsert（scrypt 随机盐哈希，占位凭证拒绝）。
2. **会话认证**：`POST /sessions` 校验密码（timingSafeEqual）、写 token SHA-256 摘要、HttpOnly/SameSite=Lax Cookie；`DELETE /sessions` 注销；过期会话返回 401。WebSocket upgrade 复用同一会话校验。
3. **JSON API**：任务书 9 个端点全部实现；统一 `{error:{code,message}}`；401/403/409/422 语义；详情装配成员、四章节文档、当前草稿与流转历史。
4. **业务一致性**：两条版本线（业务 `version` 仅审核递增，文档 `documentVersion` 独立）；生成幂等键去重、同章节旧草稿 supersede；审核事务 `SELECT FOR UPDATE` + 条件 UPDATE，保证并发只成功一次；草稿生成后文档被编辑则 409；保留完整 transitions 历史；打回理由必填；`done` 终态。
5. **实时协作**：`/collaboration` 会话与成员认证；每需求单权威 `Y.Doc`，房间隔离；标准 y-websocket 同步帧（sync + awareness）；客户端消息先排队再处理，避免房间加载期间丢帧；每次 Yjs update 在事务中追加增量、递增文档版本、刷新四章节快照；每 100 版本写全量快照；断线重连由 syncStep1/2 重新同步；服务重启从最新快照+后续增量恢复。
6. **事件广播**：`/events` 会话认证后单向 JSON 推送 `requirement.updated` 与 `comment.created`，心跳保活，不回放。
7. **AI 适配层**：`AiDraftAdapter` 接口 + `DeterministicDraftAdapter`（同输入同输出，无网络请求），`AI_ADAPTER` 配置切换；草稿只写 generations，不覆盖人工编辑。
8. **交付文档**：`README.md`、本文件、`integration.md`、`test-report.md`、`.env.example`、真实测试输出 `docs/test-output.txt`。

## 关键文件

- `src/app.ts` / `src/server.ts`：Express 应用与 HTTP/WS 启动、优雅关闭。
- `src/routes/*.ts`：9 个 JSON 端点。
- `src/domain/status.ts`：状态机、角色与章节映射；`validation.ts`：zod 参数校验；`errors.ts`：统一错误。
- `src/collab/persistence.ts`：文档创建、加载（快照+增量）、更新持久化；`roomManager.ts`：Yjs 房间、线协议、写入队列；`wss.ts`：upgrade 认证与通道分发。
- `src/events/broadcaster.ts`：事件广播。
- `tests/unit/*`、`tests/integration/*`：单测与真实 HTTP/WS/DB 集成测试。

## 与设计一致的决策与适配

- 状态→章节映射按设计锁定：`draft/confirmed→prd`、`design→technical`、`development→frontend`、`testing→tests`；对外字段不变，已写入 `integration.md`。
- 错误码 `code` 使用字符串化的 HTTP 状态码（`401`/`403`/`409`/`422`），与任务书错误码表一致。
- 未知需求 ID 返回 422，不引入契约外 404。
- 测试环境无 Docker daemon、无 native PostgreSQL 可执行权限（容器禁止切换非 root 用户），因此集成测试采用 PGlite 0.5.17（PostgreSQL 18.7 引擎 WASM 构建）通过真实 TCP + `pg` 驱动访问，配合真实 `ws` + Yjs 客户端；它不是模拟 DB/模拟 UI。生产部署仍使用原生 PostgreSQL 14+。该环境差异已如实记录于测试报告。
- `package.json` 未引入迁移框架/ORM，迁移为原生 SQL + 小型脚本；无既有仓库惯例需要兼容（基线为空仓库）。

## 未变更项

共同接口契约（9 个 JSON 路径、2 个 WS 路径、字段、枚举、错误格式）完全未变；如后续 PRD/前端联调提出冲突，按上游设计第 14 节流程记录并双方同步后再改。

## 已知限制

- `/events` 不做事件回放；客户端断线重连后须重新 GET 状态和评论。
- 文档快照每 100 次更新或房间重建时写入；极端高频编辑下恢复需重放最近≤99 条增量。
- 协作房间为单进程内存态；多实例水平部署需要共享房间/广播总线（超出首版范围）。
- PGlite 单写者模型会串行化查询，并发审批测试验证的是事务条件更新的正确性，不等价于多核原生 PostgreSQL 的并发压力测试。
- 真实大模型接入未实现，仅提供可替换适配器；不含注册/SSO/多租户/通知/第三方集成/回滚。
