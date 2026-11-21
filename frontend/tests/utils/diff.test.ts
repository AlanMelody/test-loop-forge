import { describe, expect, it } from 'vitest';
import { diffText } from '../../src/utils/diff';

describe('diffText', () => {
  it('区分新增与删除并保留未变化文本', () => {
    const segments = diffText('需求背景\n旧结论', '需求背景\n新结论');
    expect(segments).toEqual([
      { kind: 'equal', text: '需求背景\n' },
      { kind: 'removed', text: '旧' },
      { kind: 'added', text: '新' },
      { kind: 'equal', text: '结论' },
    ]);
  });

  it('处理纯新增和相同文本', () => {
    expect(diffText('', '新增')).toEqual([{ kind: 'added', text: '新增' }]);
    expect(diffText('相同', '相同')).toEqual([{ kind: 'equal', text: '相同' }]);
    expect(diffText('旧', '')).toEqual([{ kind: 'removed', text: '旧' }]);
  });
});
