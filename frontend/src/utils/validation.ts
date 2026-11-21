export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export function validateTitle(value: string): ValidationResult {
  if (!value.trim()) return { valid: false, message: '请输入需求标题。' };
  if (value.trim().length > 120) return { valid: false, message: '需求标题不能超过 120 个字符。' };
  return { valid: true };
}

export function validateRejectReason(value: string): ValidationResult {
  if (!value.trim()) return { valid: false, message: '请填写打回理由。' };
  return { valid: true };
}

export function validateComment(value: string): ValidationResult {
  if (!value.trim()) return { valid: false, message: '请输入评论内容。' };
  return { valid: true };
}

export function validateCredentials(username: string, password: string): ValidationResult {
  if (!username.trim() || !password) {
    return { valid: false, message: '请输入用户名和密码。' };
  }
  return { valid: true };
}
