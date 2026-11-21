import type { Role, Status } from '../types/domain';
import {
  ROLE_LABELS,
  STATUS_LABELS,
  canReview,
  nextStatus,
  responsibleLabel,
} from '../utils/status';

export function ReviewPanel({
  status,
  role,
  version,
  hasGeneration,
  reason,
  reasonError,
  submitting,
  onReasonChange,
  onSubmit,
}: {
  status: Status;
  role: Role;
  version: number;
  hasGeneration: boolean;
  reason: string;
  reasonError: string | null;
  submitting: boolean;
  onReasonChange(value: string): void;
  onSubmit(decision: 'approve' | 'reject'): void;
}) {
  const allowed = canReview(status, role);
  const approveTarget = nextStatus(status, 'approve');
  const rejectTarget = nextStatus(status, 'reject');
  const reasonId = 'review-reason';

  return (
    <section className="side-card" aria-labelledby="review-title">
      <h2 id="review-title">审核操作</h2>
      <dl className="meta-list">
        <div><dt>当前状态</dt><dd>{STATUS_LABELS[status]}（{status}）</dd></div>
        <div><dt>当前版本</dt><dd>v{version}</dd></div>
        <div><dt>责任角色</dt><dd>{responsibleLabel(status)}</dd></div>
        <div><dt>我的角色</dt><dd>{ROLE_LABELS[role]}（{role}）</dd></div>
      </dl>

      {status === 'done' ? (
        <p className="notice" role="status">需求已完成，不再展示通过/打回操作。</p>
      ) : !allowed ? (
        <p className="notice" role="status">
          你（{role}）不是当前责任角色（{responsibleLabel(status)}），无法审核。
        </p>
      ) : (
        <>
          {!hasGeneration && (
            <p className="notice" role="status">请先生成 AI 草稿，再提交审核。</p>
          )}
          <div className="field">
            <label htmlFor={reasonId}>审核理由 / 打回理由（打回时必填）</label>
            <textarea
              id={reasonId}
              rows={3}
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              aria-invalid={Boolean(reasonError)}
              aria-describedby={reasonError ? `${reasonId}-error` : undefined}
              placeholder="通过可留空；打回必须填写原因。"
            />
          </div>
          {reasonError && (
            <p id={`${reasonId}-error`} className="field-error" role="alert">{reasonError}</p>
          )}
          <div className="button-row">
            <button
              type="button"
              className="button button-primary"
              disabled={submitting || !hasGeneration}
              onClick={() => onSubmit('approve')}
            >
              {submitting ? '正在提交…' : `通过${approveTarget ? ` → ${STATUS_LABELS[approveTarget]}` : ''}`}
            </button>
            <button
              type="button"
              className="button button-danger"
              disabled={submitting || !hasGeneration}
              onClick={() => onSubmit('reject')}
            >
              打回{rejectTarget ? ` → ${STATUS_LABELS[rejectTarget]}` : ''}
            </button>
          </div>
          <p className="help-text" role="status" aria-live="polite">
            {submitting ? '正在提交审核，请稍候。' : '服务端会最终校验权限、版本与打回理由。'}
          </p>
        </>
      )}
    </section>
  );
}
