import { useEffect, useRef, useState } from 'react';
import { BoardColumn } from '../components/BoardColumn';
import { CreateRequirementDialog } from '../components/CreateRequirementDialog';
import { ErrorBanner } from '../components/ErrorBanner';
import { useApp } from '../state/AppContext';
import { STATUS_ORDER } from '../utils/status';

export function BoardPage() {
  const { requirements, loadingRequirements, requirementsError, loadRequirements } = useApp();
  const [dialogOpen, setDialogOpen] = useState(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void loadRequirements();
  }, [loadRequirements]);

  return (
    <div className="board-page">
      <header className="page-header">
        <div>
          <h1>全局需求看板</h1>
          <p className="muted">六个状态固定展示；点击卡片进入需求详情。</p>
        </div>
        <button
          type="button"
          ref={createButtonRef}
          className="button button-primary"
          onClick={() => setDialogOpen(true)}
        >
          创建需求
        </button>
      </header>

      {loadingRequirements && <p role="status" className="loading-state">正在加载看板…</p>}
      {requirementsError && (
        <ErrorBanner message={requirementsError} onRetry={() => void loadRequirements()} />
      )}

      <div className="board-scroll">
        <div className="board-grid">
          {STATUS_ORDER.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              requirements={requirements.filter((item) => item.status === status)}
            />
          ))}
        </div>
      </div>

      <CreateRequirementDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        returnFocusRef={createButtonRef}
      />
    </div>
  );
}
