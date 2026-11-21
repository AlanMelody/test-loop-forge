export function ConflictNotice({
  message,
  onReload,
  reloading,
}: {
  message: string;
  onReload(): void;
  reloading?: boolean;
}) {
  return (
    <div className="conflict-notice" role="alert" aria-live="assertive">
      <strong>版本冲突</strong>
      <p>{message}</p>
      <button type="button" className="button button-primary button-small" onClick={onReload} disabled={reloading}>
        {reloading ? '正在重新读取…' : '重新读取详情'}
      </button>
      <span className="help-text">冲突时不会用新内容覆盖你正在编辑的文档。</span>
    </div>
  );
}
