import { Link } from 'react-router-dom';
import type { RequirementSummary } from '../types/domain';
import { STATUS_LABELS } from '../utils/status';

export function RequirementCard({ requirement }: { requirement: RequirementSummary }) {
  return (
    <li className="requirement-card">
      <Link to={`/requirements/${requirement.id}`} className="requirement-card-link">
        <span className="card-title">{requirement.title}</span>
        <span className="card-meta">
          <span>状态：{STATUS_LABELS[requirement.status]}（{requirement.status}）</span>
          <span>版本：v{requirement.version}</span>
        </span>
      </Link>
    </li>
  );
}
