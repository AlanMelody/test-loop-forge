import type { ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import { ROLE_LABELS } from '../utils/status';

const CONNECTION_LABELS = {
  idle: '连接未启动',
  connecting: '连接中',
  connected: '已连接',
  reconnecting: '重连中',
  disconnected: '已断开',
} as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, mode, eventsStatus, globalError, setGlobalError, logout } = useApp();

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">跳转到主要内容</a>
      <header className="topbar">
        <nav className="topbar-inner" aria-label="全局导航">
          <span className="brand" aria-label="AI 研发协作平台">AI 研发协作平台</span>
          <span className={`mode-badge ${mode}`}>
            {mode === 'mock' ? '模拟模式（数据仅本地演示）' : '真实 API 模式'}
          </span>
          <span className="connection-summary" role="status">
            {CONNECTION_LABELS[eventsStatus]}
          </span>
          <span className="user-summary" aria-label="当前登录用户">
            {user ? `${user.username}（${ROLE_LABELS[user.role]} / ${user.role}）` : '未登录'}
          </span>
          <button type="button" className="button button-ghost" onClick={() => void logout()}>
            登出
          </button>
        </nav>
      </header>
      {globalError && (
        <div className="error-banner" role="alert">
          <span>错误：{globalError}</span>
          <button type="button" className="button button-small" onClick={() => setGlobalError(null)}>
            关闭提示
          </button>
        </div>
      )}
      <main id="main-content" className="workspace">
        {children}
      </main>
    </div>
  );
}
