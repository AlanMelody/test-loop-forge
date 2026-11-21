import type { Transition } from '../types/domain';
import { ROLE_LABELS, STATUS_LABELS } from '../utils/status';

function textOf(value: unknown, fallback = '未提供'): string {
  return typeof value === 'string' && value ? value : fallback;
}

export function TransitionList({ transitions }: { transitions: Transition[] }) {
  return (
    <section className="side-card" aria-labelledby="transitions-title">
      <h2 id="transitions-title">流转记录（{transitions.length}）</h2>
      {transitions.length === 0 ? (
        <p className="empty-state">暂无流转记录。</p>
      ) : (
        <ol className="transition-list">
          {transitions.map((item, index) => (
            <li key={item.id ?? index} className="transition-item">
              <span className="transition-flow">
                {item.from ? STATUS_LABELS[item.from] : '创建'}
                {' → '}
                {item.to ? STATUS_LABELS[item.to] : '未知'}
              </span>
              <span className="transition-decision">
                决定：{item.decision === 'approve' ? '通过' : item.decision === 'reject' ? '打回' : textOf(item.decision)}
              </span>
              {item.reason && <span className="transition-reason">理由：{item.reason}</span>}
              <span className="transition-meta">
                操作者：{item.actor?.role ? ROLE_LABELS[item.actor.role] : '未提供'}；
                时间：{textOf(item.createdAt)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
