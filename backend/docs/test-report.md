# 真实测试报告

- 执行时间：2026-11-21 11:20（UTC+8），命令在 `backend/` 下执行。
- 环境：Node.js v22.23.5 / npm 10.9.9 / Linux aarch64；集成测试数据库为 PGlite 0.5.17 内嵌 PostgreSQL 18.7（WASM 引擎，监听 127.0.0.1 随机端口，由 `pg` 驱动经 TCP 连接）；WebSocket 使用真实 `ws` + Yjs 客户端。
- 环境说明：本机无 Docker daemon、无 `psql`/`pg_ctl`，容器禁止切换非 root 用户，无法启动原生 PostgreSQL 进程；测试使用 PostgreSQL 引擎的 WASM 构建而不是 mock。生产部署契约仍为原生 PostgreSQL 14+。
- 原始输出：`docs/test-output.txt`（由 `tee` 保存的同一次真实运行输出）。

## 执行命令与结果

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过，0 错误 |
| `npm run build` | 通过，0 错误 |
| `npm test` | 6 个测试文件、22 个测试全部通过，耗时约 10.7s |
| `npm run test:unit` | 4 文件 / 10 测试通过 |
| `npm run test:integration` | 2 文件 / 12 测试通过 |

最终 `npm test` 输出摘要：

```
 ✓ tests/unit/ai.test.ts (2 tests) 7ms
 ✓ tests/unit/stateMachine.test.ts (3 tests) 9ms
 ✓ tests/unit/validation.test.ts (3 tests) 9ms
 ✓ tests/unit/password.test.ts (2 tests) 401ms
 ✓ tests/integration/api.test.ts (7 tests) 7355ms
 ✓ tests/integration/collaboration.test.ts (5 tests) 7447ms
 Test Files  6 passed (6)
      Tests  22 passed (22)
```

## 验收项覆盖

| 验收项 | 测试位置 | 结果 |
| --- | --- | --- |
| AC-1 错误密码拒绝 | `tests/integration/api.test.ts` → AC-1（断言 401、错误体、无 Set-Cookie） | 通过 |
| AC-2 四账号登录 | AC-2（四账号依次登录，角色 pm/backend/frontend/test） | 通过 |
| AC-3 非责任角色审核被拒 | AC-3（三种非责任角色 403，pm 通过进入 confirmed） | 通过 |
| AC-4 通过/打回与历史保留 | AC-3 + AC-4（打回保持 draft、理由必填 422、transitions/版本递增） | 通过 |
| AC-5 并发审批只成功一次 | AC-5（同 expectedVersion 并发，200+409，版本 2，历史 1 条） | 通过 |
| AC-6 双客户端同章节合并 | `tests/integration/collaboration.test.ts` AC-6（两个真实 Yjs WS 客户端并发插入，收敛并持久化） | 通过 |
| AC-7 断线恢复与重启保留 | AC-7（断线重连同步 + 关闭并重建数据库/服务后内容仍存在） | 通过 |
| AC-8 文档隔离 | AC-8（两个需求，编辑 A 后 B 仍为空且 B 客户端读到空） | 通过 |
| AC-9 契约一致性 | API AC-9 + WS 未认证测试（401/403/409/422、幂等、未知 ID） | 通过 |
| AC-10 全流程 | API AC-10（五阶段审批到 done、done 后 422、四角色评论可见）+ 协作 AC-10（/events 广播结构与内容） | 通过 |

## 修复记录（真实失败 → 修复 → 重跑）

1. 首轮集成：未登录错误 `code` 返回了中文消息而非 `401`；`requireAuth` 的 ApiError 参数顺序错误，已修正，AC-9 重跑通过。
2. 首轮协作：Yjs 线协议多包了一层 `varUint8Array`，且房间异步加载期间客户端首帧未挂监听导致同步超时；已改为标准 y-websocket 帧并在连接建立时立即缓存消息、房间就绪后回放，AC-6/7/8 重跑通过。
3. 最终全量重跑 22/22 通过，无跳过、无模拟 UI 检查。

## 限制

- PGlite 为单写者模型，并发审批验证的是条件更新事务语义，不能替代原生 PostgreSQL 的并发压力测试。
- 测试覆盖的是首版固定四账号与单进程协作；多实例部署、真实大模型、通知/回滚等不在范围内。
