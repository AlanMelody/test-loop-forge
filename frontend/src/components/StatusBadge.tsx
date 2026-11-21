import type { Status } from '../types/domain';
import { STATUS_LABELS } from '../utils/status';

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span aria-hidden="true">●</span> {STATUS_LABELS[status]}（{status}）
    </span>
  );
}
