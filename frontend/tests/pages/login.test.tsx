import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppProvider } from '../../src/state/AppContext';
import { LoginPage } from '../../src/pages/LoginPage';

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <AppProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/requirements" element={<div>看板已到达</div>} />
        </Routes>
      </AppProvider>
    </MemoryRouter>,
  );
}

describe('登录页', () => {
  it('使用演示账号登录成功并进入看板', async () => {
    const user = userEvent.setup();
    renderLogin();
    expect(screen.getByText('模拟模式（数据仅本地演示）')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /填入 pm/ }));
    await user.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByText('看板已到达')).toBeInTheDocument();
  });

  it('密码错误时显示通用错误且停留在登录页', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText('用户名'), 'pm');
    await user.type(screen.getByLabelText('密码'), 'wrong');
    await user.click(screen.getByRole('button', { name: '登录' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('用户名或密码错误');
    expect(screen.queryByText('看板已到达')).not.toBeInTheDocument();
  });

  it('空输入被阻止并给出字段级提示', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.click(screen.getByRole('button', { name: '登录' }));
    expect(screen.getByRole('alert')).toHaveTextContent('请输入用户名和密码');
  });
});
