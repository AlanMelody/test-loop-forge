import type { SectionKey } from '../types/domain';
import type { ConnectionStatus } from '../adapters';
import { SECTION_LABELS } from '../utils/status';

const SAVE_LABELS = { saved: '已保存（本地）', saving: '保存中…', error: '保存失败' } as const;
const CONNECTION_LABELS = {
  connecting: '连接中',
  connected: '已连接',
  reconnecting: '重连中',
  disconnected: '已断开',
} as const;

export function SectionEditor({
  sectionKey,
  value,
  connection,
  saveState,
  onChange,
  mockMode,
}: {
  sectionKey: SectionKey;
  value: string;
  connection: ConnectionStatus;
  saveState: keyof typeof SAVE_LABELS;
  onChange(next: string): void;
  mockMode: boolean;
}) {
  const id = `section-editor-${sectionKey}`;
  const statusId = `${id}-status`;
  return (
    <section className="section-card" aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`}>
        {SECTION_LABELS[sectionKey]} <span className="enum-label">({sectionKey})</span>
      </h3>
      <label className="section-label" htmlFor={id}>{SECTION_LABELS[sectionKey]}正文</label>
      <textarea
        id={id}
        className="section-textarea"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={8}
        aria-describedby={statusId}
        placeholder="在此输入章节内容；四角色均可编辑。"
      />
      <p id={statusId} className="section-status" role="status" aria-live="polite">
        保存状态：{SAVE_LABELS[saveState]}；文档连接：{CONNECTION_LABELS[connection]}
        {mockMode ? '；模拟模式不跨浏览器同步' : ''}
      </p>
    </section>
  );
}
