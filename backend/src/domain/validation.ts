import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(500),
});

export const createRequirementSchema = z.object({
  title: z.string().trim().min(1, '标题不能为空').max(200),
});

export const createCommentSchema = z.object({
  content: z.string().trim().min(1, '评论内容不能为空').max(2000),
});

export const generationSchema = z.object({
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(1).max(200),
});

export const reviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(1000).optional(),
  generationId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
});

export const uuidSchema = z.string().uuid();
