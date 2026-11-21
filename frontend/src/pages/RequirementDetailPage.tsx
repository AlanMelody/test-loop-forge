import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adapter } from '../adapters';
import type { ConnectionStatus } from '../adapters';
import { CommentPanel } from '../components/CommentPanel';
import { ConflictNotice } from '../components/ConflictNotice';
import { ErrorBanner } from '../components/ErrorBanner';
import { GenerationPanel } from '../components/GenerationPanel';
import { ReviewPanel } from '../components/ReviewPanel';
import { SectionEditor } from '../components/SectionEditor';
import { StatusBadge } from '../components/StatusBadge';
import { TransitionList } from '../components/TransitionList';
import { useSharedDocument } from '../collaboration/useSharedDocument';
import { useApp } from '../state/AppContext';
import type { Comment, Generation, RequirementDetail } from '../types/domain';
import { ApiError, isConflict, isUnauthorized, messageForError } from '../utils/errors';
import { createIdempotencyKey } from '../utils/idempotency';
import { ROLE_LABELS, SECTION_LABELS, SECTION_ORDER, STATUS_LABELS } from '../utils/status';
import { validateRejectReason } from '../utils/validation';

export function RequirementDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <ErrorBanner message="需求 ID 缺失，请返回看板重新进入。" />;
  return <RequirementDetailContent key={id} requirementId={id} />;
}

const CONNECTION_TEXT: Record<ConnectionStatus | 'idle', string> = {
  idle: '未启动',
  connecting: '连接中',
  connected: '已连接',
  reconnecting: '重连中',
  disconnected: '已断开',
};

function RequirementDetailContent({ requirementId }: { requirementId: string }) {
  const { user, mode, eventsStatus, handleError, lastRequirementUpdate, lastCommentEvent, refreshToken } =
    useApp();
  const [detail, setDetail] = useState<RequirementDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [baseline, setBaseline] = useState('');
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [notice, setNotice] = useState('');
  const idempotencyKeyRef = useRef<string | null>(null);
  const loadCommentsRef = useRef<() => void>(() => undefined);
  const dismissGeneration = useCallback(() => setPreviewOpen(false), []);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setDetailError(null);
    try {
      const next = await adapter.requirements.get(requirementId);
      setDetail(next);
      setGeneration(next.generation);
      return next;
    } catch (error) {
      handleError(error, { inline: true });
      setDetailError(messageForError(error));
      return null;
    } finally {
      setLoading(false);
    }
  }, [requirementId, handleError]);

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    setCommentsError(null);
    try {
      const response = await adapter.comments.list(requirementId);
      setComments(response);
    } catch (error) {
      handleError(error, { inline: true });
      setCommentsError(messageForError(error));
    } finally {
      setCommentsLoading(false);
    }
  }, [requirementId, handleError]);

  loadCommentsRef.current = () => {
    void loadComments();
  };
  const onResync = useCallback(() => loadCommentsRef.current(), []);

  const shared = useSharedDocument({
    requirementId,
    user,
    detail,
    onResync,
  });

  const reportError = useCallback(
    (error: unknown) => {
      const message = handleError(error, { inline: true });
      if (isConflict(error)) setConflict(message);
      else if (!isUnauthorized(error)) setPageError(message);
      return message;
    },
    [handleError],
  );

  useEffect(() => {
    void loadDetail();
    void loadComments();
  }, [loadDetail, loadComments]);

  useEffect(() => {
    if (lastRequirementUpdate?.requirementId === requirementId) {
      void loadDetail();
    }
  }, [lastRequirementUpdate, requirementId, loadDetail]);

  useEffect(() => {
    if (lastCommentEvent?.requirementId === requirementId) {
      void loadComments();
    }
  }, [lastCommentEvent, requirementId, loadComments]);

  useEffect(() => {
    if (refreshToken > 0) {
      void loadDetail();
      void loadComments();
    }
  }, [refreshToken, loadDetail, loadComments]);

  if (!user) return null;

  const reread = async () => {
    setReloading(true);
    try {
      const fresh = await loadDetail();
      if (fresh) shared.reloadFromDetail(fresh);
      await loadComments();
      setConflict(null);
      setNotice('已重新读取最新详情与评论。');
    } finally {
      setReloading(false);
    }
  };

  const generate = async () => {
    if (!detail) return;
    setGenerating(true);
    setPageError(null);
    setConflict(null);
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = createIdempotencyKey();
    try {
      const next = await adapter.generations.create(requirementId, {
        expectedVersion: detail.version,
        idempotencyKey: idempotencyKeyRef.current,
      });
      setGeneration(next);
      setPreviewOpen(true);
      setBaseline(shared.sections[next.section] ?? detail.document.sections[next.section] ?? '');
      idempotencyKeyRef.current = null;
      setNotice(`已生成 ${SECTION_LABELS[next.section]} 草稿，请预览。`);
    } catch (error) {
      reportError(error);
    } finally {
      setGenerating(false);
    }
  };

  const applyGeneration = async () => {
    if (!generation || !detail) return;
    setApplying(true);
    setPageError(null);
    setConflict(null);
    try {
      const fresh = await adapter.requirements.get(requirementId);
      if (fresh.version !== (generation.documentVersion ?? detail.version)) {
        throw new ApiError(409, 'VERSION_CONFLICT', '版本已变化，请重新读取后再应用草稿。');
      }
      if (shared.sections[generation.section] !== baseline) {
        setPageError('章节内容在生成后已变化，请取消并重新生成，避免覆盖人工编辑。');
        return;
      }
      shared.replaceSection(generation.section, generation.content);
      setPreviewOpen(false);
      setNotice(`草稿已应用到 ${SECTION_LABELS[generation.section]}。`);
    } catch (error) {
      reportError(error);
    } finally {
      setApplying(false);
    }
  };

  const submitReview = async (decision: 'approve' | 'reject') => {
    if (!detail) return;
    if (decision === 'reject') {
      const validation = validateRejectReason(reason);
      if (!validation.valid) {
        setReasonError(validation.message ?? '请填写打回理由。');
        return;
      }
    }
    setReasonError(null);
    setSubmitting(true);
    setPageError(null);
    setConflict(null);
    try {
      const updated = await adapter.reviews.create(requirementId, {
        decision,
        reason: reason.trim(),
        generationId: generation?.id ?? '',
        expectedVersion: detail.version,
      });
      setDetail((current) =>
        current ? { ...current, status: updated.status, version: updated.version } : current,
      );
      setGeneration(null);
      setPreviewOpen(false);
      setReason('');
      setNotice(`审核完成，状态已更新为 ${STATUS_LABELS[updated.status]}。`);
      await loadComments();
    } catch (error) {
      reportError(error);
    } finally {
      setSubmitting(false);
    }
  };

  const submitComment = async (content: string) => {
    setCommentSubmitting(true);
    try {
      await adapter.comments.create(requirementId, { content });
      await loadComments();
      setNotice('评论已发布。');
    } catch (error) {
      reportError(error);
      throw error;
    } finally {
      setCommentSubmitting(false);
    }
  };

  return (
    <div className="detail-page">
      <nav aria-label="面包屑" className="breadcrumb">
        <Link to="/requirements">← 返回看板</Link>
      </nav>
      <header className="page-header">
        <div>
          <h1>{detail?.title ?? '需求详情'}</h1>
          {detail && (
            <div className="detail-summary">
              <StatusBadge status={detail.status} />
              <span>版本：v{detail.version}</span>
              <span>协作连接：{CONNECTION_TEXT[shared.connection]}</span>
            </div>
          )}
        </div>
        {detail && (
          <ul className="member-list" aria-label="需求成员">
            {detail.members.map((member) => (
              <li key={member.id} className="role-chip">
                {ROLE_LABELS[member.role]}（{member.role}）{member.username ? ` · ${member.username}` : ''}
              </li>
            ))}
          </ul>
        )}
      </header>

      {loading && !detail && <p role="status" className="loading-state">正在加载需求详情…</p>}
      {detailError && !detail && (
        <ErrorBanner message={detailError} onRetry={() => void loadDetail()} retryLabel="重新加载详情" />
      )}
      {pageError && <ErrorBanner message={pageError} onRetry={() => void loadDetail()} retryLabel="重新加载详情" />}
      {conflict && <ConflictNotice message={conflict} onReload={() => void reread()} reloading={reloading} />}
      <p className="notice sr-only" role="status" aria-live="polite">{notice}</p>

      {detail && (
        <div className="detail-grid">
          <section className="document-panel" aria-labelledby="document-title">
            <h2 id="document-title">共享文档（四章节）</h2>
            <p className="muted">
              连接：{CONNECTION_TEXT[shared.connection]}；事件通道：{CONNECTION_TEXT[eventsStatus]}；
              在线：{shared.presence.length} 人{mode === 'mock' ? '（模拟模式，仅本地演示）' : ''}
            </p>
            {SECTION_ORDER.map((key) => (
              <SectionEditor
                key={key}
                sectionKey={key}
                value={shared.sections[key] ?? ''}
                connection={shared.connection}
                saveState={shared.saveState}
                onChange={(next) => shared.updateSection(key, next)}
                mockMode={mode === 'mock'}
              />
            ))}
          </section>

          <aside className="side-panel" aria-label="审核与评论区域">
            <GenerationPanel
              generation={generation}
              previewOpen={previewOpen}
              baseline={baseline}
              currentText={generation ? shared.sections[generation.section] ?? '' : ''}
              generating={generating || applying}
              onGenerate={() => void generate()}
              onApply={() => void applyGeneration()}
              onDismiss={dismissGeneration}
            />
            <ReviewPanel
              status={detail.status}
              role={user.role}
              version={detail.version}
              hasGeneration={Boolean(generation)}
              reason={reason}
              reasonError={reasonError}
              submitting={submitting}
              onReasonChange={(value) => {
                setReason(value);
                if (reasonError) setReasonError(null);
              }}
              onSubmit={(decision) => void submitReview(decision)}
            />
            <CommentPanel
              comments={comments}
              loading={commentsLoading}
              error={commentsError}
              submitting={commentSubmitting}
              onSubmit={submitComment}
              onRetry={() => void loadComments()}
            />
            <TransitionList transitions={detail.transitions ?? []} />
          </aside>
        </div>
      )}
    </div>
  );
}
