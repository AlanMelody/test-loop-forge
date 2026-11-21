import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import type { AppContext } from './context.js';
import { errorHandler } from './domain/errors.js';
import { sessionRoutes } from './routes/sessions.js';
import { requirementRoutes } from './routes/requirements.js';
import { commentRoutes } from './routes/comments.js';
import { generationRoutes } from './routes/generations.js';
import { reviewRoutes } from './routes/reviews.js';

export function createApp(ctx: AppContext): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(sessionRoutes(ctx));
  app.use(requirementRoutes(ctx));
  app.use(commentRoutes(ctx));
  app.use(generationRoutes(ctx));
  app.use(reviewRoutes(ctx));
  app.use(errorHandler);
  return app;
}
