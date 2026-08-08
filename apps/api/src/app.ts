import express from 'express';
import { env } from './config/env';
import { logger } from './infrastructure/logger';
import { notificationRoutes } from './modules/notifications';
import { errorHandler } from './shared/middleware/error-handler';

const app = express();

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: env.nodeEnv,
  });
});

app.use('/api/v1/notifications', notificationRoutes);

app.use(errorHandler);

export { app, logger };
