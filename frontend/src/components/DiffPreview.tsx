import { diffText } from '../utils/diff';

export function DiffPreview({ before, after }: { before: string; after: string }) {
  const segments = diffText(before, after);
  if (segments.length === 0) {
    return <p className="muted">当前章节为空，草稿将新增全部内容。</p>;
  }
  return (
    <div className="diff-preview" role="region" aria-label="AI 草稿差异预览" aria-live="polite">
      <p className="diff-legend">
        <span><ins>新增内容</ins></span>
        <span><del>删除内容</del></span>
        <span>未变化内容</span>
      </p>
      <pre>
        {segments.map((segment, index) => {
          if (segment.kind === 'added') return <ins key={index}>{segment.text}</ins>;
          if (segment.kind === 'removed') return <del key={index}>{segment.text}</del>;
          return <span key={index}>{segment.text}</span>;
        })}
      </pre>
    </div>
  );
}
