import { useState, type FormEvent } from 'react';
import type { Comment } from '../types/domain';
import { ROLE_LABELS } from '../utils/status';
import { ErrorBanner } from './ErrorBanner';

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN');
}

export function CommentPanel({
  comments,
  loading,
  error,
  submitting,
  onSubmit,
  onRetry,
}: {
  comments: Comment[];
  loading: boolean;
  error: string | null;
  submitting: boolean;
  onSubmit(content: string): Promise<void>;
  onRetry(): void;
}) {
  const [content, setContent] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!content.trim()) {
      setFieldError('请输入评论内容。');
      return;
    }
    setFieldError(null);
    try {
      await onSubmit(content);
      setContent('');
    } catch {
      // 页面级错误横幅负责展示；保留输入以便重试。
    }
  };

  return (
    <section className="side-card" aria-labelledby="comments-title">
      <h2 id="comments-title">全员评论（{comments.length}）</h2>
      {loading && <p role="status">正在加载评论…</p>}
      {error && <ErrorBanner message={error} onRetry={onRetry} retryLabel="重新加载评论" />}
      {!loading && !error && comments.length === 0 && (
        <p className="empty-state">暂无评论，欢迎发表第一条。</p>
      )}
      <ul className="comment-list">
        {comments.map((comment) => (
          <li key={comment.id} className="comment-item">
            <div className="comment-header">
              <span className="role-chip">{ROLE_LABELS[comment.author.role]}（{comment.author.role}）</span>
              <time dateTime={comment.createdAt}>{formatTime(comment.createdAt)}</time>
            </div>
            <p className="comment-content">{comment.content}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <div className="field">
          <label htmlFor="comment-content">发表评论</label>
          <textarea
            id="comment-content"
            rows={3}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            aria-invalid={Boolean(fieldError)}
            aria-describedby={fieldError ? 'comment-error' : undefined}
            placeholder="所有角色可见；模拟模式仅本地可见。"
          />
        </div>
        {fieldError && <p id="comment-error" className="field-error" role="alert">{fieldError}</p>}
        <button type="submit" className="button button-primary button-block" disabled={submitting}>
          {submitting ? '正在发送…' : '发送评论'}
        </button>
      </form>
    </section>
  );
}
