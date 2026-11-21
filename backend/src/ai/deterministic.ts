import { createHash } from 'node:crypto';
import type { AiDraftAdapter, DraftInput } from './adapter.js';

const SECTION_LABELS: Record<DraftInput['section'], string> = {
  prd: '产品需求文档',
  technical: '技术方案',
  frontend: '前端说明',
  tests: '测试用例',
};

/**
 * 确定性模拟适配器：相同输入必得相同输出，不发网络请求。
 * 真实模型后续只需实现 AiDraftAdapter 并在 createAiAdapter 中替换。
 */
export class DeterministicDraftAdapter implements AiDraftAdapter {
  async generate(input: DraftInput): Promise<{ content: string }> {
    const fingerprint = createHash('sha256')
      .update([input.requirementId, input.title, input.status, input.section, String(input.documentVersion)].join('\u001f'))
      .digest('hex')
      .slice(0, 8);
    const existing = input.currentSections[input.section]?.trim();
    const baseline = existing ? `当前章节已有 ${existing.length} 字符人工内容，草稿仅作补充，不覆盖原文。` : '当前章节暂无人工内容。';
    return {
      content: [
        `【${SECTION_LABELS[input.section]}草稿】`,
        `需求：${input.title}`,
        `阶段：${input.status}`,
        `文档版本：${input.documentVersion}`,
        baseline,
        `确定性指纹：${fingerprint}`,
        '验收建议：明确边界条件、异常路径与可验证的完成标准。',
      ].join('\n'),
    };
  }
}

export function createAiAdapter(name: string): AiDraftAdapter {
  if (name !== 'deterministic') {
    throw new Error(`Unsupported AI_ADAPTER: ${name}`);
  }
  return new DeterministicDraftAdapter();
}
