import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code: string = String(status)) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function asyncRoute(handler: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const message = first ? `${first.path.join('.') || 'body'}: ${first.message}` : '请求参数无效';
    res.status(422).json({ error: { code: '422', message } });
    return;
  }
  if (error instanceof SyntaxError && 'body' in error) {
    res.status(422).json({ error: { code: '422', message: '请求体不是合法 JSON' } });
    return;
  }
  console.error('[unhandled]', error);
  res.status(500).json({ error: { code: '500', message: '服务内部错误' } });
}
