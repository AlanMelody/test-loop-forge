import { describe, expect, it } from 'vitest';
import {
  createCommentSchema,
  createRequirementSchema,
  generationSchema,
  reviewSchema,
} from '../../src/domain/validation.js';

describe('请求参数校验（422 映射）', () => {
  it('拒绝空标题和空评论', () => {
    expect(createRequirementSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(createCommentSchema.safeParse({ content: '' }).success).toBe(false);
    expect(createCommentSchema.safeParse({ content: 'ok' }).success).toBe(true);
  });

  it('拒绝非法生成参数', () => {
    expect(generationSchema.safeParse({ expectedVersion: 0, idempotencyKey: 'k' }).success).toBe(false);
    expect(generationSchema.safeParse({ expectedVersion: 1, idempotencyKey: '' }).success).toBe(false);
  });

  it('拒绝非法审核参数，打回理由由路由层强制必填', () => {
    const base = { decision: 'approve', generationId: '11111111-1111-4111-8111-111111111111', expectedVersion: 1 };
    expect(reviewSchema.safeParse(base).success).toBe(true);
    expect(reviewSchema.safeParse({ ...base, decision: 'maybe' }).success).toBe(false);
    expect(reviewSchema.safeParse({ ...base, generationId: 'nope' }).success).toBe(false);
  });
});
