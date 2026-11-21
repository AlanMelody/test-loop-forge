import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { mockAdapter } from '../../src/adapters/mock';
import { BoardPage } from '../../src/pages/BoardPage';
import { AppProvider } from '../../src/state/AppContext';
import { STATUS_ORDER } from '../../src/utils/status';

function renderBoard() {
  return render(
    <MemoryRouter initialEntries={['/requirements']}>
      <AppProvider>
        <Routes>
          <Route path="/requirements" element={<BoardPage />} />
        </Routes>
      </AppProvider>
    </MemoryRouter>,
  );
}

describe('全局看板', () => {
  it('始终展示六列，空列有空状态', async () => {
    await mockAdapter.auth.login({ username: 'pm', password: 'demo1234' });
    renderBoard();
    for (const status of STATUS_ORDER) {
      expect(screen.getByTestId(`column-${status}`)).toBeInTheDocument();
    }
    expect(await screen.findAllByText('暂无需求')).toHaveLength(6);
  });

  it('空标题被阻止，有效标题创建后出现在对应列且可键盘进入详情', async () => {
    const user = userEvent.setup();
    await mockAdapter.auth.login({ username: 'pm', password: 'demo1234' });
    renderBoard();
    await user.click(screen.getByRole('button', { name: '创建需求' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('需求标题')).toHaveFocus();

    await user.click(screen.getByRole('button', { name: '创建' }));
    expect(screen.getByRole('alert')).toHaveTextContent('请输入需求标题');

    await user.type(screen.getByLabelText('需求标题'), '浏览器验证需求');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const card = await screen.findByRole('link', { name: /浏览器验证需求/ });
    expect(card).toHaveAttribute('href', expect.stringContaining('/requirements/'));
    expect(card).toHaveTextContent('版本：v1');
    expect(card).toHaveTextContent('草稿');
  });
});
