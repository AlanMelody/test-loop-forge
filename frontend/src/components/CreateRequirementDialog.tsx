import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApp } from '../state/AppContext';
import { messageForError } from '../utils/errors';
import { validateTitle } from '../utils/validation';

export function CreateRequirementDialog({
  open,
  onClose,
  returnFocusRef,
}: {
  open: boolean;
  onClose(): void;
  returnFocusRef: React.RefObject<HTMLButtonElement>;
}) {
  const { createRequirement } = useApp();
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        returnFocusRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, returnFocusRef]);

  if (!open) return null;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateTitle(title);
    if (!validation.valid) {
      setError(validation.message ?? '请输入需求标题。');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createRequirement(title);
      setTitle('');
      onClose();
      returnFocusRef.current?.focus();
    } catch (reason) {
      setError(messageForError(reason));
    } finally {
      setSubmitting(false);
    }
  };

  const close = () => {
    onClose();
    returnFocusRef.current?.focus();
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close();
    }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-requirement-title">
        <h2 id="create-requirement-title">创建需求</h2>
        <form onSubmit={(event) => void onSubmit(event)} noValidate>
          <div className="field">
            <label htmlFor="new-requirement-title">需求标题</label>
            <input
              id="new-requirement-title"
              ref={inputRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? 'create-requirement-error' : undefined}
            />
          </div>
          {error && <p id="create-requirement-error" className="field-error" role="alert">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="button" onClick={close}>取消</button>
            <button type="submit" className="button button-primary" disabled={submitting}>
              {submitting ? '正在创建…' : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
