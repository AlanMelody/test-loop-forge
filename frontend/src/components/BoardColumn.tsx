import type { RequirementSummary, Status } from '../types/domain';
import { STATUS_LABELS } from '../utils/status';
import { RequirementCard } from './RequirementCard';

export function BoardColumn({
  status,
  requirements,
}: {
  status: Status;
  requirements: RequirementSummary[];
}) {
  return (
    <section className="board-column" data-testid={`column-${status}`} aria-labelledby={`column-title-${status}`}>
      <header className="board-column-header">
        <h2 id={`column-title-${status}`}>{STATUS_LABELS[status]}</h2>
        <span className="column-enum">{status}</span>
        <span className="column-count">{requirements.length} 项</span>
      </header>
      <div className="board-column-body">
        {requirements.length === 0 ? (
          <p className="column-empty">暂无需求</p>
        ) : (
          <ul className="card-list">
            {requirements.map((requirement) => (
              <RequirementCard key={requirement.id} requirement={requirement} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
