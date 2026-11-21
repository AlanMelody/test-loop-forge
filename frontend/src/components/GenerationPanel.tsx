import { useEffect, useRef } from 'react';
import type { Generation } from '../types/domain';
import { SECTION_LABELS } from '../utils/status';
import { DiffPreview } from './DiffPreview';

export function GenerationPanel({
  generation,
  previewOpen,
  baseline,
  currentText,
  generating,
  onGenerate,
  onApply,
  onDismiss,
}: {
  generation: Generation | null;
  previewOpen: boolean;
  baseline: string;
  currentText: string;
  generating: boolean;
  onGenerate(): void;
  onApply(): void;
  onDismiss(): void;
}) {
  const generateRef = useRef<HTMLButtonElement>(null);
  const applyRef = useRef<HTMLButtonElement>(null);
  const contentChanged = generation !== null && currentText !== baseline;

  useEffect(() => {
    if (!generation || !previewOpen) return;
    applyRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onDismiss();
        generateRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [generation, previewOpen, onDismiss]);

  return (
    <section className="side-card" aria-labelledby="generation-title">
      <h2 id="generation-title">AI 草稿</h2>
      <p className="muted">确定性模拟生成；真实模型后续通过适配层接入。</p>
      <button
        ref={generateRef}
        type="button"
        className="button button-primary button-block"
        onClick={onGenerate}
        disabled={generating}
      >
        {generating ? '正在生成…' : '生成 AI 草稿'}
      </button>
      <p role="status" aria-live="polite" className="help-text">
        {generating ? '正在生成草稿，请稍候。' : generation ? '草稿已生成，请预览后决定是否应用。' : '暂无草稿。'}
      </p>

      {generation && previewOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) {
            onDismiss();
            generateRef.current?.focus();
          }
        }}>
          <div className="modal modal-wide" role="dialog" aria-modal="true" aria-labelledby="preview-title">
            <h2 id="preview-title">草稿预览与差异</h2>
            <dl className="meta-list">
              <div><dt>章节</dt><dd>{SECTION_LABELS[generation.section]}（{generation.section}）</dd></div>
              <div><dt>状态</dt><dd>{generation.status ?? '未提供'}</dd></div>
              <div><dt>文档版本</dt><dd>{generation.documentVersion ?? '未提供'}</dd></div>
              <div><dt>草稿 ID</dt><dd>{generation.id}</dd></div>
            </dl>
            <DiffPreview before={baseline} after={generation.content} />
            {contentChanged && (
              <p className="field-error" role="alert">
                章节内容在生成后已变化，请先取消并重新生成，避免覆盖人工编辑。
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button"
                onClick={() => {
                  onDismiss();
                  generateRef.current?.focus();
                }}
              >
                取消
              </button>
              <button
                ref={applyRef}
                type="button"
                className="button button-primary"
                onClick={onApply}
                disabled={contentChanged}
              >
                应用草稿
              </button>
            </div>
            <p className="help-text">只有显式点击“应用草稿”才会修改章节；取消不会改变文档。</p>
          </div>
        </div>
      )}
    </section>
  );
}
