import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { MOCK_ACCOUNTS } from '../adapters/mock/store';
import { messageForError } from '../utils/errors';
import { validateCredentials } from '../utils/validation';

export function LoginPage() {
  const { user, ready, login, mode } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const from = new URLSearchParams(location.search).get('from') || '/requirements';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (ready && user) return <Navigate to={from} replace />;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateCredentials(username, password);
    if (!validation.valid) {
      setError(validation.message ?? '请输入用户名和密码。');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login({ username, password });
      navigate(from, { replace: true });
    } catch (reason) {
      setError(messageForError(reason));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <span className={`mode-badge ${mode}`}>
          {mode === 'mock' ? '模拟模式（数据仅本地演示）' : '真实 API 模式'}
        </span>
        <h1 id="login-title">登录工作台</h1>
        <p className="muted">使用四类固定账号之一登录，角色由服务端返回。</p>
        <form onSubmit={(event) => void onSubmit(event)} noValidate>
          <div className="field">
            <label htmlFor="username">用户名</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>
          <div className="field">
            <label htmlFor="password">密码</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>
          {error && <p id="login-error" className="field-error" role="alert">{error}</p>}
          <button type="submit" className="button button-primary button-block" disabled={submitting}>
            {submitting ? '正在登录…' : '登录'}
          </button>
          <p className="help-text" role="status">{submitting ? '正在验证账号，请稍候。' : ''}</p>
        </form>

        {mode === 'mock' && (
          <div className="demo-accounts" aria-label="演示账号（仅模拟模式）">
            <h2>演示账号（仅模拟模式）</h2>
            <p className="muted">密码均为 demo1234；真实模式不使用这些账号。</p>
            <div className="demo-account-list">
              {MOCK_ACCOUNTS.map((account) => (
                <button
                  key={account.user.id}
                  type="button"
                  className="button button-small"
                  onClick={() => {
                    setUsername(account.username);
                    setPassword(account.password);
                    setError(null);
                  }}
                >
                  填入 {account.username}（{account.user.role}）
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
