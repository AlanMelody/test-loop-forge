import { describe, expect, it } from 'vitest';
import { DeterministicDraftAdapter } from '../../src/ai/deterministic.js';
import type { DraftInput } from '../../src/ai/adapter.js';

const input: DraftInput = {
  requirementId: '11111111-1111-4111-8111-111111111111',
  title: '多人实时编辑',
  status: 'draft',
  section: 'prd',
  currentSections: { prd: '', technical: '', frontend: '', tests: '' },
  documentVersion: 1,
};

describe('确定性 AI 草稿适配器', () => {
  const adapter = new DeterministicDraftAdapter();

  it('相同输入得到相同输出', async () => {
    const first = await adapter.generate(input);
    const second = await adapter.generate(input);
    expect(second).toEqual(first);
  });

  it('不同标题/阶段/章节/文档版本得到不同内容', async () => {
    const base = (await adapter.generate(input)).content;
    const variants = await Promise.all([
      adapter.generate({ ...input, title: '另一个需求' }),
      adapter.generate({ ...input, status: 'confirmed' }),
      adapter.generate({ ...input, section: 'tests' }),
      adapter.generate({ ...input, documentVersion: 2 }),
    ]);
    for (const variant of variants) expect(variant.content).not.toEqual(base);
  });
});
