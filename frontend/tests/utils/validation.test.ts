import { describe, expect, it } from 'vitest';
import {
  validateComment,
  validateCredentials,
  validateRejectReason,
  validateTitle,
} from '../../src/utils/validation';

describe('表单校验', () => {
  it('标题去除空白后不得为空', () => {
    expect(validateTitle('   ').valid).toBe(false);
    expect(validateTitle('  需求 A  ').valid).toBe(true);
  });

  it('打回理由必填，评论必填，凭据必填', () => {
    expect(validateRejectReason('  ').valid).toBe(false);
    expect(validateRejectReason('信息不足').valid).toBe(true);
    expect(validateComment('').valid).toBe(false);
    expect(validateCredentials('pm', '').valid).toBe(false);
  });
});
