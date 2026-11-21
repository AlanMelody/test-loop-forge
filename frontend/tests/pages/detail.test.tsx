import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { mockAdapter } from '../../src/adapters/mock';
import { findRequirement } from '../../src/adapters/mock/store';
import { RequirementDetailPage } from '../../src/pages/RequirementDetailPage';
import { AppProvider } from '../../src/state/AppContext';

function renderDetail(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/requirements/${id}`]}>
      <AppProvider>
        <Routes>
          <Route path="/requirements/:id" element={<RequirementDetailPage />} />
        </Routes>
      </AppProvider>
    </MemoryRouter>,
  );
}

async function createAs(username: string) {
  await mockAdapter.auth.login({ username, password: 'demo1234' });
  return mockAdapter.requirements.create({ title: '详情测试需求' });
}

describe('需求详情', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('展示四章节、成员、状态、版本与评论空态', async () => {
    const requirement = await createAs('pm');
    renderDetail(requirement.id);
    expect(await screen.findByRole('heading', { name: /共享文档/ })).toBeInTheDocument();
    for (const label of ['产品需求文档（PRD）', '技术方案', '前端说明', '测试用例']) {
      expect(screen.getAllByText(new RegExp(label)).length).toBeGreaterThan(0);
    }
    expect(screen.getByLabelText('产品需求文档（PRD）正文')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: '需求成员' })).toHaveTextContent('产品经理');
    expect(screen.getByText(/版本：v1/)).toBeInTheDocument();
    expect(await screen.findByText(/暂无评论/)).toBeInTheDocument();
    expect(screen.getByText(/请先生成 AI 草稿/)).toBeInTheDocument();
  });

  it('章节编辑在模拟模式下持久化到详情数据', async () => {
    const user = userEvent.setup();
    const requirement = await createAs('pm');
    renderDetail(requirement.id);
    const prd = await screen.findByLabelText('产品需求文档（PRD）正文');
    await user.type(prd, 'PRD 正文：允许编辑');
    expect(prd).toHaveValue('PRD 正文：允许编辑');
    expect(screen.getAllByText(/保存状态：/).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(findRequirement(requirement.id)?.document.sections.prd).toBe('PRD 正文：允许编辑');
    }, { timeout: 2000 });
  });

  it('发表评论后列表显示角色与内容', async () => {
    const user = userEvent.setup();
    const requirement = await createAs('backend');
    renderDetail(requirement.id);
    await user.type(await screen.findByLabelText('发表评论'), '技术方案已读');
    await user.click(screen.getByRole('button', { name: '发送评论' }));
    expect(await screen.findByText('技术方案已读')).toBeInTheDocument();
    expect(screen.getByText('服务端工程师（backend）')).toBeInTheDocument();
  });

  it('打回理由为空时阻止提交，填写后状态流转', async () => {
    const user = userEvent.setup();
    const requirement = await createAs('pm');
    renderDetail(requirement.id);
    await user.click(await screen.findByRole('button', { name: '生成 AI 草稿' }));
    const generation = await screen.findByRole('dialog', { name: '草稿预览与差异' });
    expect(generation).toHaveTextContent('新增内容');
    await user.click(screen.getByRole('button', { name: '取消' }));

    await user.click(screen.getByRole('button', { name: /打回/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('请填写打回理由');

    await user.type(screen.getByLabelText(/审核理由/), '缺少验收口径');
    await user.click(screen.getByRole('button', { name: /打回/ }));
    await waitFor(() => {
      expect(screen.getAllByText(/草稿（draft）/).length).toBeGreaterThan(0);
      expect(screen.getByText(/版本：v2/)).toBeInTheDocument();
    });
    expect(await screen.findByText(/理由：缺少验收口径/)).toBeInTheDocument();
  });

  it('责任角色通过后状态前进', async () => {
    const user = userEvent.setup();
    const requirement = await createAs('pm');
    renderDetail(requirement.id);
    await user.click(await screen.findByRole('button', { name: '生成 AI 草稿' }));
    await user.click(await screen.findByRole('button', { name: '应用草稿' }));
    await user.click(await screen.findByRole('button', { name: /通过/ }));
    await waitFor(() => {
      expect(screen.getAllByText(/已确认（confirmed）/).length).toBeGreaterThan(0);
    });
  });

  it('非责任角色不展示审核操作，done 状态也不展示', async () => {
    const requirement = await createAs('frontend');
    const firstView = renderDetail(requirement.id);
    await screen.findByRole('heading', { name: /共享文档/ });
    expect(screen.queryByRole('button', { name: /通过/ })).not.toBeInTheDocument();
    expect(screen.getByText(/无法审核/)).toBeInTheDocument();

    firstView.unmount();
    let version = 1;
    for (const actor of ['pm', 'pm', 'backend', 'frontend', 'test']) {
      await mockAdapter.auth.logout();
      await mockAdapter.auth.login({ username: actor, password: 'demo1234' });
      const generation = await mockAdapter.generations.create(requirement.id, {
        expectedVersion: version,
        idempotencyKey: `done-key-${version}`,
      });
      await mockAdapter.reviews.create(requirement.id, {
        decision: 'approve',
        reason: '',
        generationId: generation.id,
        expectedVersion: version,
      });
      version += 1;
    }
    renderDetail(requirement.id);
    expect(await screen.findByText(/需求已完成，不再展示通过\/打回操作/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /打回/ })).not.toBeInTheDocument();
  });
});
