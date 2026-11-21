# AI 研发协作平台后端

独立运行的 Node.js + TypeScript 服务，提供会话认证、需求/共享文档/评论、确定性 AI 草稿、责任角色审核、Yjs 实时协作与事件广播。

## 环境与启动

要求 Node.js 20+、PostgreSQL 14+（生产环境使用真实 PostgreSQL 实例）。

```bash
cd backend
npm install
cp .env.example .env          # 填入真实 DATABASE_URL 与四账号凭证
npm run migrate               # 建表，幂等
npm run seed                  # 初始化四个固定账号（按 username upsert）
npm run build
npm start                     # 或开发模式 npm run dev
```

服务默认监听 `http://127.0.0.1:4000`；`PORT` 可配置。生产环境设置 `NODE_ENV=production` 后会话 Cookie 自动带 `Secure`。

## 四账号初始化

在 `.env`（或进程环境）中设置以下变量后执行 `npm run seed`：

| 角色 | 用户名变量 | 密码变量 |
| --- | --- | --- |
| pm | `SEED_PM_USERNAME` | `SEED_PM_PASSWORD` |
| backend | `SEED_BACKEND_USERNAME` | `SEED_BACKEND_PASSWORD` |
| frontend | `SEED_FRONTEND_USERNAME` | `SEED_FRONTEND_PASSWORD` |
| test | `SEED_TEST_USERNAME` | `SEED_TEST_PASSWORD` |

占位符（`<...>`）会被 seed 拒绝；密码只以 scrypt 哈希落库，仓库与文档中不含真实凭证。每个新需求自动写入这四个角色成员。

## 测试

```bash
npm run typecheck
npm run build
npm test                      # 单测 + 集成测试
npm run test:unit
npm run test:integration
```

集成测试使用 PGlite（PostgreSQL 18 引擎的 WASM 构建）经真实 TCP 监听，由 `pg` 驱动连接；WebSocket 测试使用真实 `ws` + Yjs 客户端。测试自建临时数据库目录并在结束后清理，无需外部数据库服务。详见 `docs/test-report.md`。

## 前端联调

契约细节见 `docs/integration.md`。要点：

- JSON API 基址为后端根路径；会话 Cookie 名默认 `lf_session`（HttpOnly + SameSite=Lax）。
- `GET /requirements/:id` 返回最新版本；生成/审核必须带其 `version` 作为 `expectedVersion`。
- `requirements.version` 只在审核成功时递增；`generation.documentVersion` 来自独立的文档版本，草稿生成后如文档被编辑，审核返回 409。
- Yjs 协作地址 `/collaboration?requirementId=<uuid>`，房间由 query 决定；四章节为根级 `Y.Text`：`prd` / `technical` / `frontend` / `tests`。
- 事件地址 `/events` 只接收服务端 JSON 广播，不回放；断线后前端需重新 GET 状态与文档。
- 错误统一为 `{error:{code,message}}`，`code` 为 `401` / `403` / `409` / `422` / `500` 字符串。

## 目录

```
src/          服务源码（config/db/auth/domain/ai/events/collab/routes）
migrations/   001_init.sql
tests/        unit + integration + helpers
docs/         implementation.md / integration.md / test-report.md
```
